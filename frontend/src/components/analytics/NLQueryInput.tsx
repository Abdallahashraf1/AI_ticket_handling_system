'use client'

import { FormEvent, useState } from 'react'

type Props = {
  onSubmit: (question: string) => Promise<void> | void
  isLoading?: boolean
}

export default function NLQueryInput({ onSubmit, isLoading }: Props) {
  const [question, setQuestion] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    await onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <label className="text-sm font-semibold text-gray-700">Ask Analytics Question</label>
      <textarea
        rows={3}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Example: How many tickets were auto-resolved this week?"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-60"
        >
          {isLoading ? 'Running...' : 'Run Query'}
        </button>
      </div>
    </form>
  )
}

