'use client';

import type { SearchResultItem, SearchV1Response, SignalSummaryV1 } from '@signal/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSearch } from '../../lib/api/fetch-search';

type IntelSearchProps = {
  signals: SignalSummaryV1[];
  onSelectSignal: (signal: SignalSummaryV1) => void;
  onSelectCountry: (iso2: string) => void;
  onSelectEntity: (entityType: string, entityId: string) => void;
  windowHours?: number;
};

const DEBOUNCE_MS = 250;

export function IntelSearch({
  signals: _signals,
  onSelectSignal,
  onSelectCountry,
  onSelectEntity,
  windowHours,
}: IntelSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [meta, setMeta] = useState<{ scope: string; windowCapped: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setMeta(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data: SearchV1Response = await fetchSearch(query, windowHours);
        if (!controller.signal.aborted) {
          setResults(data.results);
          setMeta({ scope: data.scope, windowCapped: data.windowCapped });
          setOpen(true);
        }
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setMeta(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, windowHours]);

  const handleSelect = useCallback(
    (r: SearchResultItem) => {
      if (r.type === 'signal' && r.signal) onSelectSignal(r.signal as SignalSummaryV1);
      else if (r.type === 'country' && r.iso2) onSelectCountry(r.iso2);
      else if (r.type === 'entity' && r.entityType && r.entityId)
        onSelectEntity(r.entityType, r.entityId);
      setOpen(false);
      setQuery('');
    },
    [onSelectSignal, onSelectCountry, onSelectEntity],
  );

  const scopeLabel = meta?.scope === 'token_index' ? 'Full index' : 'Recent signals';

  return (
    <div className="intel-search" ref={ref}>
      <input
        type="search"
        className="intel-search__input"
        placeholder="Search signals, entities, countries…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.length >= 2) setOpen(true);
        }}
        onFocus={() => query.length >= 2 && results.length > 0 && setOpen(true)}
      />
      {loading && query.length >= 2 && <div className="intel-search__loading">Searching…</div>}
      {open && results.length > 0 && (
        <div className="intel-search__dropdown">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.label}-${r.sublabel ?? ''}`}
              type="button"
              className="intel-search__result"
              onClick={() => handleSelect(r)}
            >
              <span className="intel-search__result-type">{r.type}</span>
              <span className="intel-search__result-label">{r.label}</span>
              {r.sublabel && <span className="intel-search__result-sub">{r.sublabel}</span>}
            </button>
          ))}
          <div className="intel-search__scope">
            {scopeLabel}
            {meta?.windowCapped && ' · limited window'}
          </div>
        </div>
      )}
      {open && !loading && results.length === 0 && query.length >= 2 && (
        <div className="intel-search__dropdown">
          <div className="intel-search__empty">No results</div>
        </div>
      )}
    </div>
  );
}
