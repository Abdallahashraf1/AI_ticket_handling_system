"""
Chunking Pipeline (Phase 3)

Strategy:
1. Split on structural boundaries: headings (#/##) and blank lines (\n\n)
2. Token-count each unit via tiktoken (cl100k_base)
3. If a unit exceeds max_tokens, split further by sentence
4. Greedy-merge consecutive units until adding the next would exceed max_tokens
5. Add 1-sentence overlap: prepend last sentence of chunk N to chunk N+1
6. Each chunk carries: text, chunk_index, section (nearest heading)
"""

import re
import math
import tiktoken

_TOKENIZER = tiktoken.get_encoding("cl100k_base")


def _count_tokens(text: str) -> int:
    return len(_TOKENIZER.encode(text))


def _split_sentences(text: str) -> list[str]:
    """Simple sentence splitter on . ! ? boundaries."""
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p for p in parts if p]


def _is_heading(line: str) -> bool:
    return bool(re.match(r'^#{1,4}\s+', line))


def _extract_heading_text(line: str) -> str:
    return re.sub(r'^#{1,4}\s+', '', line).strip()


def chunk_article(content: str, max_tokens: int = 400) -> list[dict]:
    """
    Chunk article content into semantically coherent pieces.
    Returns: [{"text": str, "chunk_index": int, "section": str}, ...]
    """
    lines = content.split('\n')

    # Step 1: Build units (paragraphs with section tracking)
    units = []  # List of {"text": str, "section": str}
    current_section = ""
    current_block: list[str] = []

    def flush_block():
        if current_block:
            block_text = '\n'.join(current_block).strip()
            if block_text:
                units.append({"text": block_text, "section": current_section})
            current_block.clear()

    for line in lines:
        if _is_heading(line):
            flush_block()
            current_section = _extract_heading_text(line)
        elif line.strip() == "":
            flush_block()
        else:
            current_block.append(line)

    flush_block()

    # Step 2: Split units that exceed max_tokens by sentence
    split_units = []
    for unit in units:
        if _count_tokens(unit["text"]) <= max_tokens:
            split_units.append(unit)
        else:
            sentences = _split_sentences(unit["text"])
            buf = []
            buf_tokens = 0
            for sentence in sentences:
                s_tokens = _count_tokens(sentence)
                if buf_tokens + s_tokens > max_tokens and buf:
                    split_units.append({"text": ' '.join(buf), "section": unit["section"]})
                    buf = [sentence]
                    buf_tokens = s_tokens
                else:
                    buf.append(sentence)
                    buf_tokens += s_tokens
            if buf:
                split_units.append({"text": ' '.join(buf), "section": unit["section"]})

    # Step 3: Greedy merge small consecutive units
    merged: list[dict] = []
    for unit in split_units:
        if not merged:
            merged.append({"text": unit["text"], "section": unit["section"]})
        else:
            combined = merged[-1]["text"] + "\n\n" + unit["text"]
            if _count_tokens(combined) <= max_tokens:
                # Merge, prefer the section from the first chunk
                merged[-1]["text"] = combined
            else:
                merged.append({"text": unit["text"], "section": unit["section"]})

    # Step 4: Add 1-sentence overlap
    chunks = []
    for i, chunk in enumerate(merged):
        text = chunk["text"]
        if i > 0:
            prev_sentences = _split_sentences(merged[i - 1]["text"])
            if prev_sentences:
                overlap = prev_sentences[-1]
                text = overlap + " " + text

        chunks.append({
            "text": text.strip(),
            "chunk_index": i,
            "section": chunk["section"]
        })

    return chunks


def chunk_from_paragraphs(paragraphs: list[str], section: str = "", max_tokens: int = 400) -> list[dict]:
    """Chunk from pre-split paragraphs (for DOCX/PDF where we get paragraph objects)."""
    content = "\n\n".join(paragraphs)
    if section:
        content = f"# {section}\n\n{content}"
    return chunk_article(content, max_tokens)
