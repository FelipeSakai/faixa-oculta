// The saved catalog flattens multiple Spotify artist credits into one comma-separated string.
const artistWithComma = /^(?:Earth, Wind & Fire|Franco, The Sir!|Ryu, The Runner)(?=\s*(?:,|$))/iu;

export function mainArtist(track) {
  const first = Array.isArray(track?.artists) ? track.artists[0] : null;
  const name = typeof first === 'string' ? first : first?.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  if (typeof track?.artist !== 'string') return '';
  const credit = track.artist.trim().split(/;|\s+\(?(?:feat(?:uring)?|ft)\.?\s+/iu, 1)[0].trim();
  return credit.match(artistWithComma)?.[0] ?? credit.split(',', 1)[0].trim();
}

function isRecordingNote(text) {
  const credit = /^(?:feat(?:uring)?\b|ft\b|with\s|participação especial\b|sample\s*:|from (?:the series\b|.*\bsoundtrack\b))/iu;
  const recording = /^(?:ao vivo\b|ac[úu]stic[oa]\b|acoustic\b|a cappella\b|instrumental\b|live(?:$|\s+(?:at|in|from|on)\b))/iu;
  const edition = /\b(?:remaster(?:ed)?|remix|version|radio edit)(?:\s+\d{4})?$/iu;
  return credit.test(text) || recording.test(text) || edition.test(text);
}

export function titleInitials(title) {
  if (typeof title !== 'string') return '';
  const text = title.normalize('NFC')
    .replace(/\(([^()]*)\)|\[([^\[\]]*)\]/gu, (part, round, square) =>
      isRecordingNote((round ?? square).trim()) ? ' ' : part)
    .replace(/\s+(?:feat(?:uring)?|ft)\.?\s+.+$/iu, '');
  const parts = text.split(/\s+[-–—]\s+/u);
  const note = parts.findIndex((part, index) => index > 0 && isRecordingNote(part.trim()));
  const readable = parts.slice(0, note < 0 ? parts.length : note).join(' ');
  // An apostrophe joins a contraction, and decimal numbers are one word.
  const words = readable.match(/\p{N}+(?:[.,]\p{N}+)+|[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’][\p{L}\p{N}\p{M}]+)*/gu) ?? [];
  return words.map(word => word.match(/^.\p{M}*/u)[0].toLocaleUpperCase('pt-BR')).join(' · ');
}
