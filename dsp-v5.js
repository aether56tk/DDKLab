// Updated DSP event detector placeholder: preserve waveform candidates while using
// temporal clustering so multiple local maxima from one production are not counted
// as separate productions. See README for validation requirements.

export function clusterCandidates(candidates, options = {}) {
  const minGap = options.minGapMs ?? 80;
  const maxMergeGap = options.maxMergeGapMs ?? 260;
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const sorted = [...candidates].sort((a, b) => a.time - b.time);
  const groups = [];
  let group = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = group[group.length - 1];
    const cur = sorted[i];
    const gapMs = (cur.time - prev.time) * 1000;

    // Very close maxima are likely sub-peaks of the same production.
    if (gapMs < minGap) {
      group.push(cur);
    } else {
      groups.push(group);
      group = [cur];
    }
  }
  groups.push(group);

  return groups.map((g, index) => {
    const strongest = g.reduce((a, b) =>
      (b.amplitude ?? 0) > (a.amplitude ?? 0) ? b : a
    );
    const spanMs = (g[g.length - 1].time - g[0].time) * 1000;
    return {
      ...strongest,
      eventId: index + 1,
      sourceCandidates: g,
      mergedCandidateCount: g.length,
      reviewRequired: spanMs > maxMergeGap,
    };
  });
}

export function countAMR(events) {
  return Array.isArray(events) ? events.length : 0;
}

// SMR rule: PA-TA-KA is ONE complete cycle. Never count its three
// syllable landmarks as three SMR cycles.
export function countSMRCycles(syllableEvents) {
  if (!Array.isArray(syllableEvents) || syllableEvents.length === 0) return 0;
  let cycles = 0;
  let state = 0; // PA -> TA -> KA
  for (const event of syllableEvents) {
    const token = String(event.token || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (state === 0 && token === 'PA') state = 1;
    else if (state === 1 && token === 'TA') state = 2;
    else if (state === 2 && token === 'KA') {
      cycles += 1;
      state = 0;
    } else if (token === 'PA') {
      state = 1;
    }
  }
  return cycles;
}

export const DSP_VERSION = 'DSP-V5.1-LOCAL-PRELIMINARY';
