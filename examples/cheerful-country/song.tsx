/**
 * Example: a cheerful country tune in G major.
 * Demonstrates sections, layered tracks, a chord progression, a walking-ish bass,
 * a train-beat drum pattern, a fiddle lead, and a reusable user component.
 */
import {
  Song, Section, Track, Progression, Pattern, Arp, Note, Rest,
} from "codesong";

// Reusable component: a country "boom-chick" drum groove that loops to fill a section.
function CountryBeat() {
  return (
    <Track instrument="drums" gain={0.9} loop>
      <Pattern steps="bd ~ sd ~ bd bd sd ~" dur="8n" velocity={0.9} />
      <Pattern steps="hh hh hh hh hh hh hh hh" dur="8n" velocity={0.5} />
    </Track>
  );
}

const VERSE_CHORDS = ["G", "G", "C", "G", "C", "G", "D", "G"];
const CHORUS_CHORDS = ["C", "C", "G", "G", "D", "C", "G", "D"];

export default (
  <Song title="Sunny Backroads" tempo={124} keySignature="G major" timeSignature={[4, 4]} seed={7}>
    <Section name="intro" bars={4}>
      <Track name="gtr" instrument="acoustic-guitar" gain={0.7} pan={-0.2} reverb={0.18} loop>
        <Progression chords={["G", "C", "G", "D"]} dur="1n" strum="down" />
      </Track>
      <Track name="bass" instrument="bass" gain={0.85} octave={2} loop>
        <Progression chords={["G", "C", "G", "D"]} dur="1n" voicing="root5" />
      </Track>
      <CountryBeat />
    </Section>

    <Section name="verse" bars={8}>
      <Track name="gtr" instrument="acoustic-guitar" gain={0.7} pan={-0.2} reverb={0.18} loop>
        <Progression chords={VERSE_CHORDS} dur="1n" strum="down" />
      </Track>
      <Track name="bass" instrument="bass" gain={0.85} octave={2} loop>
        <Progression chords={VERSE_CHORDS} dur="1n" voicing="root5" />
      </Track>
      <Track name="fiddle" instrument="fiddle" gain={0.5} pan={0.3} reverb={0.3} octave={5} loop>
        <Note pitch="D5" dur="4n" />
        <Note pitch="B4" dur="4n" />
        <Note pitch="G4" dur="2n" />
        <Rest dur="1n" />
      </Track>
      <CountryBeat />
    </Section>

    <Section name="chorus" bars={8}>
      <Track name="gtr" instrument="acoustic-guitar" gain={0.75} pan={-0.2} reverb={0.2} loop>
        <Progression chords={CHORUS_CHORDS} dur="1n" strum="down" />
      </Track>
      <Track name="bass" instrument="bass" gain={0.9} octave={2} loop>
        <Progression chords={CHORUS_CHORDS} dur="1n" voicing="root5" />
      </Track>
      <Track name="keys" instrument="piano" gain={0.4} pan={0.15} reverb={0.25} octave={4} loop>
        <Arp chord="C" pattern="up" step="8n" length="1n" />
        <Arp chord="C" pattern="up" step="8n" length="1n" />
        <Arp chord="G" pattern="up" step="8n" length="1n" />
        <Arp chord="G" pattern="up" step="8n" length="1n" />
        <Arp chord="D" pattern="up" step="8n" length="1n" />
        <Arp chord="C" pattern="up" step="8n" length="1n" />
        <Arp chord="G" pattern="up" step="8n" length="1n" />
        <Arp chord="D" pattern="up" step="8n" length="1n" />
      </Track>
      <CountryBeat />
    </Section>
  </Song>
);
