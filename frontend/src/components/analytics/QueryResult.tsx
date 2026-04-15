'use client'

import { AnalyticsQueryResponse } from '@/hooks/useAnalytics'

type Props = {
  data: AnalyticsQueryResponse | null
  error?: string | null
}

export default function QueryResult({ data, error }: Props) {
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-500">
        Run a natural language query to see results.
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wide">Generated SQL</div>
        <pre className="mt-1 bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-x-auto">{data.sql_query}</pre>
      </div>
      <div className="text-sm text-gray-700">{data.explanation}</div>
      <div className="text-sm font-medium text-gray-900">{data.summary}</div>

      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {data.columns.map((column) => (
                <th key={column} className="px-3 py-2 text-left border border-gray-200 text-gray-700">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(data.columns.length, 1)} className="px-3 py-3 text-center text-gray-500 border border-gray-200">
                  No rows
                </td>
              </tr>
            ) : (
              data.rows.map((row, index) => (
                <tr key={index}>
                  {data.columns.map((column) => (
                    <td key={`${index}-${column}`} className="px-3 py-2 border border-gray-200 text-gray-800">
                      {String(row[column] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

