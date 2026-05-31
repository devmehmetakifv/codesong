/**
 * "Midnight Porch" — a slow, relaxing 12-bar blues in C.
 * Left-hand piano comps dominant 9th chords, a gentle root–fifth bass holds it down,
 * a sparse right-hand blues-scale melody floats on top, with a soft brushed groove.
 */
import { Song, Section, Track, Progression, Pattern, Note, Rest } from "codesong";

// Classic 12-bar blues with a quick change (bar 2 = IV), jazzy 9th voicings.
const TWELVE_BAR = ["C9", "F9", "C9", "C9", "F9", "F9", "C9", "C9", "G9", "F9", "C9", "G7"];
const INTRO = ["C9", "C9", "F9", "G7"];
const OUTRO = ["F9", "C9", "G7", "C9"];

// Soft brushed groove: rim on the backbeat (2 & 4), light hats, a whisper of kick on 1.
function BrushGroove() {
  return (
    <Track name="drums" instrument="drums" gain={0.35} loop>
      <Pattern steps="bd ~ ~ ~ ~ ~ ~ ~" dur="8n" velocity={0.5} />
      <Pattern steps="~ ~ rs ~ ~ ~ rs ~" dur="8n" velocity={0.45} />
      <Pattern steps="hh hh hh hh hh hh hh hh" dur="8n" velocity={0.28} />
    </Track>
  );
}

// Two-bar right-hand blues lick (C blues scale: C Eb F Gb G Bb), loops over the form.
function RightHand() {
  return (
    <Track name="rh" instrument="piano" gain={0.5} pan={0.25} reverb={0.4} octave={4} loop>
      <Note pitch="G4" dur="4n." velocity={0.6} />
      <Note pitch="Bb4" dur="8n" velocity={0.55} />
      <Note pitch="C5" dur="2n" velocity={0.65} />
      <Rest dur="4n" />
      <Note pitch="Eb5" dur="4n" velocity={0.6} />
      <Note pitch="C5" dur="8n" velocity={0.5} />
      <Note pitch="Bb4" dur="8n" velocity={0.5} />
      <Note pitch="G4" dur="2n" velocity={0.6} />
    </Track>
  );
}

export default (
  <Song title="Midnight Porch" tempo={66} keySignature="C major" timeSignature={[4, 4]} seed={11}>
    <Section name="intro" bars={4}>
      <Track name="piano" instrument="piano" gain={0.6} pan={-0.1} reverb={0.32} octave={3} loop>
        <Progression chords={INTRO} dur="1n" strum="down" velocity={0.55} />
      </Track>
      <Track name="bass" instrument="bass" gain={0.30} octave={2} loop>
        <Progression chords={INTRO} dur="1n" voicing="root5" velocity={0.55} />
      </Track>
    </Section>

    <Section name="head" bars={12}>
      <Track name="piano" instrument="piano" gain={0.6} pan={-0.1} reverb={0.32} octave={3} loop>
        <Progression chords={TWELVE_BAR} dur="1n" strum="down" velocity={0.55} />
      </Track>
      <Track name="bass" instrument="bass" gain={0.30} octave={2} loop>
        <Progression chords={TWELVE_BAR} dur="1n" voicing="walk" velocity={0.55} />
      </Track>
      <RightHand />
      <BrushGroove />
    </Section>

    <Section name="solo" bars={12}>
      <Track name="piano" instrument="piano" gain={0.6} pan={-0.1} reverb={0.32} octave={3} loop>
        <Progression chords={TWELVE_BAR} dur="1n" strum="down" velocity={0.5} />
      </Track>
      <Track name="bass" instrument="bass" gain={0.30} octave={2} loop>
        <Progression chords={TWELVE_BAR} dur="1n" voicing="walk" velocity={0.55} />
      </Track>
      <RightHand />
      <BrushGroove />
    </Section>

    <Section name="outro" bars={4}>
      <Track name="piano" instrument="piano" gain={0.6} pan={-0.1} reverb={0.4} octave={3} loop>
        <Progression chords={OUTRO} dur="1n" strum="down" velocity={0.5} />
      </Track>
      <Track name="bass" instrument="bass" gain={0.30} octave={2} loop>
        <Progression chords={OUTRO} dur="1n" voicing="root" velocity={0.5} />
      </Track>
    </Section>
  </Song>
);
