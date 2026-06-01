/** Example: a mellow lo-fi beat in A minor. Shows swing, a reverb room, per-track
 *  insert effects (filter/chorus/delay), and a drum mix-group bus. */
import { Song, Section, Track, Progression, Pattern, Arp, Effect } from "codesong";

const CHORDS = ["Am7", "Dm7", "Gmaj7", "Cmaj7"];

export default (
  <Song title="Rainy Window" tempo={78} keySignature="C major" timeSignature={[4, 4]} seed={3} swing={0.55} room="room">
    <Section name="loop" bars={8}>
      <Track name="keys" instrument="electric-piano" gain={0.55} pan={-0.1} reverb={0.35} octave={4} loop>
        {/* Muffled, slightly warbly Rhodes — the classic lo-fi tone. */}
        <Effect type="filter" mode="lowpass" cutoff={2400} q={0.7} />
        <Effect type="chorus" rate={0.8} depth={5} mix={0.35} />
        <Progression chords={CHORDS} dur="1n" strum="down" />
      </Track>
      <Track name="bass" instrument="bass" gain={0.8} octave={2} loop>
        <Progression chords={CHORDS} dur="1n" voicing="root" />
      </Track>
      <Track name="pad" instrument="pad" gain={0.25} pan={0.2} reverb={0.5} octave={4} loop>
        <Progression chords={CHORDS} dur="1n" />
      </Track>
      <Track name="bells" instrument="flute" gain={0.3} pan={0.35} reverb={0.45} octave={5} loop>
        {/* Dotted-quarter echo for a dubby tail. */}
        <Effect type="delay" time="4n." feedback={0.35} mix={0.4} />
        <Arp chord="Am7" pattern="updown" step="8n" length="1n" />
        <Arp chord="Dm7" pattern="updown" step="8n" length="1n" />
        <Arp chord="Gmaj7" pattern="updown" step="8n" length="1n" />
        <Arp chord="Cmaj7" pattern="updown" step="8n" length="1n" />
      </Track>
      <Track name="drums" instrument="drums" gain={0.75} bus="beat" loop>
        <Pattern steps="bd ~ ~ ~ sd ~ ~ bd" dur="8n" velocity={0.8} />
        <Pattern steps="hh ~ hh ~ hh ~ hh ~" dur="8n" velocity={0.4} />
      </Track>
    </Section>
  </Song>
);
