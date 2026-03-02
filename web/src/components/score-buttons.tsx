'use client'

import { SCORE_LABELS, SCORE_BUTTON_COLORS } from '@/lib/scoring/engine'

interface ScoreButtonsProps {
  value: number | null
  onChange: (score: number) => void
  disabled?: boolean
}

export default function ScoreButtons({ value, onChange, disabled = false }: ScoreButtonsProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {[0, 1, 2, 3, 4, 5].map(score => (
        <button
          key={score}
          type="button"
          disabled={disabled}
          data-active={value === score}
          onClick={() => onChange(score)}
          className={`flex flex-col items-center px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all disabled:opacity-40 ${SCORE_BUTTON_COLORS[score]}`}
        >
          <span className="text-lg font-bold leading-none mb-0.5">{score}</span>
          <span className="text-center leading-tight max-w-[70px]">{SCORE_LABELS[score]}</span>
        </button>
      ))}
    </div>
  )
}
