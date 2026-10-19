"use strict";
function publicMidiPreview(preview) {
  if (!preview || typeof preview !== "object" || preview.kind !== "midi") return preview;
  const ticksPerQuarter = Math.max(1, Math.min(9600, Number(preview.ticksPerQuarter) || 480));
  const maxTicks = ticksPerQuarter * 32;
  const notes = (Array.isArray(preview.notes) ? preview.notes : [])
    .filter(note => note && Number.isFinite(Number(note.start)) && Number(note.start) >= 0 && Number(note.start) < maxTicks)
    .slice(0, 96)
    .map(note => ({note: Math.max(0,Math.min(127,Number(note.note)||0)), start:Number(note.start),duration:Math.max(1,Math.min(Number(note.duration)||1,maxTicks-Number(note.start))),velocity:Math.max(0,Math.min(127,Number(note.velocity)||0))}));
  return {kind:"midi",previewVersion:2,fullPreview:false,ticksPerQuarter,totalTicks:Math.min(maxTicks,Math.max(ticksPerQuarter*4,Number(preview.totalTicks)||ticksPerQuarter*4)),notes,truncated:Boolean(preview.truncated||preview.fullPreview||(preview.notes||[]).length>notes.length)};
}
module.exports={publicMidiPreview};
