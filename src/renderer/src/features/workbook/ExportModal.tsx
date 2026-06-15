import { useState } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: (payload: {
    format: 'anki-package' | 'anki-text-bundle' | 'generic-text-bundle'
    deckName: string
    direction: 'en-zh' | 'zh-en' | 'bilingual'
    includeExpressions: boolean
    includeSentences: boolean
    tagPrefix: string
    outputLocation: string
    keepFlaggedItems: boolean
  }) => void
}

export function ExportModal({ open, onClose, onConfirm }: Props) {
  const [deckName, setDeckName] = useState('DialogLingo')
  const [direction, setDirection] = useState<'en-zh' | 'zh-en' | 'bilingual'>('bilingual')
  const [includeExpressions, setIncludeExpressions] = useState(true)
  const [includeSentences, setIncludeSentences] = useState(true)
  const [tagPrefix, setTagPrefix] = useState('dialoglingo')
  const [outputLocation, setOutputLocation] = useState('~/Downloads/DialogLingo')
  const [keepFlaggedItems, setKeepFlaggedItems] = useState(false)

  if (!open) {
    return null
  }

  return (
    <div className="sheet-backdrop">
      <div className="sheet export-modal">
        <p className="sheet-kicker">Export Workbook</p>
        <h2>Choose an export target</h2>
        <input
          aria-label="Deck name"
          value={deckName}
          onChange={(event) => setDeckName(event.target.value)}
        />
        <input
          aria-label="Tag prefix"
          value={tagPrefix}
          onChange={(event) => setTagPrefix(event.target.value)}
        />
        <input
          aria-label="Output location"
          value={outputLocation}
          onChange={(event) => setOutputLocation(event.target.value)}
        />
        <select
          aria-label="Direction"
          value={direction}
          onChange={(event) =>
            setDirection(event.target.value as 'en-zh' | 'zh-en' | 'bilingual')
          }
        >
          <option value="en-zh">EN -&gt; ZH</option>
          <option value="zh-en">ZH -&gt; EN</option>
          <option value="bilingual">Bilingual</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={includeExpressions}
            onChange={(event) => setIncludeExpressions(event.target.checked)}
          />
          Expressions
        </label>
        <label>
          <input
            type="checkbox"
            checked={includeSentences}
            onChange={(event) => setIncludeSentences(event.target.checked)}
          />
          Sentences
        </label>
        <label>
          <input
            type="checkbox"
            checked={keepFlaggedItems}
            onChange={(event) => setKeepFlaggedItems(event.target.checked)}
          />
          Keep flagged items
        </label>
        <div className="sheet-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                format: 'anki-package',
                deckName,
                direction,
                includeExpressions,
                includeSentences,
                tagPrefix,
                outputLocation,
                keepFlaggedItems
              })
            }
          >
            Export Anki Package
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                format: 'anki-text-bundle',
                deckName,
                direction,
                includeExpressions,
                includeSentences,
                tagPrefix,
                outputLocation,
                keepFlaggedItems
              })
            }
          >
            Export Anki Text Bundle
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                format: 'generic-text-bundle',
                deckName,
                direction,
                includeExpressions,
                includeSentences,
                tagPrefix,
                outputLocation,
                keepFlaggedItems
              })
            }
          >
            Export Generic Text Bundle
          </button>
        </div>
      </div>
    </div>
  )
}
