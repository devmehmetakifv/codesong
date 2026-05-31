/** Starter song. Edit me, then: codesong render song.tsx -o out.wav */
import { Song, Section, Track, Progression, Pattern, Arp } from "codesong";

export default (
  <Song title="My Song" tempo={120} keySignature="C major" timeSignature={[4, 4]} seed={1}>
    <Section name="main" bars={8}>
      <Track name="chords" instrument="piano" gain={0.6} reverb={0.2} octave={4} loop>
        <Progression chords={["C", "G", "Am", "F"]} dur="1n" strum="down" />
      </Track>
      <Track name="bass" instrument="bass" gain={0.85} octave={2} loop>
        <Progression chords={["C", "G", "Am", "F"]} dur="1n" voicing="root5" />
      </Track>
      <Track name="drums" instrument="drums" gain={0.9} loop>
        <Pattern steps="bd ~ sd ~" dur="8n" />
        <Pattern steps="hh hh hh hh" dur="8n" velocity={0.5} />
      </Track>
    </Section>
  </Song>
);
