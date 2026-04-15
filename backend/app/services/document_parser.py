"""
Document Parser (Phase 3)
Extracts text from PDF, DOCX, TXT, and Markdown files.
"""
import io
import re
from typing import BinaryIO


def parse_text(content: bytes, filename: str) -> str:
    """Dispatch to the correct parser based on file extension."""
    ext = filename.rsplit('.', 1)[-1].lower()
    if ext == 'pdf':
        return _parse_pdf(content)
    elif ext == 'docx':
        return _parse_docx(content)
    elif ext in ('txt', 'md', 'markdown'):
        return content.decode('utf-8', errors='replace')
    else:
        raise ValueError(f"Unsupported file format: .{ext}")


def _parse_pdf(content: bytes) -> str:
    try:
        import pdfplumber
        text_blocks = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                blocks = page.extract_words(use_text_flow=True, extra_attrs=['size'])
                if not blocks:
                    continue
                # Group words into lines/paragraphs
                lines: list[str] = []
                current_line: list[str] = []
                current_top = blocks[0].get('top', 0) if blocks else 0
                for word in blocks:
                    if abs(word.get('top', 0) - current_top) > 5:
                        if current_line:
                            lines.append(' '.join(current_line))
                        current_line = [word['text']]
                        current_top = word.get('top', 0)
                    else:
                        current_line.append(word['text'])
                if current_line:
                    lines.append(' '.join(current_line))
                text_blocks.append('\n'.join(lines))
        return '\n\n'.join(text_blocks)
    except ImportError:
        raise RuntimeError("pdfplumber is required for PDF parsing. Install it with: pip install pdfplumber")


def _parse_docx(content: bytes) -> str:
    try:
        from docx import Document
        doc = Document(io.BytesIO(content))
        paragraphs = []
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            # Detect headings via style
            if para.style.name.startswith('Heading'):
                level = para.style.name.split(' ')[-1]
                try:
                    level = int(level)
                except ValueError:
                    level = 1
                paragraphs.append('#' * level + ' ' + text)
            else:
                paragraphs.append(text)
        return '\n\n'.join(paragraphs)
    except ImportError:
        raise RuntimeError("python-docx is required for DOCX parsing. Install it with: pip install python-docx")
