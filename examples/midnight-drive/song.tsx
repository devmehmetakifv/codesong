/**
 * Example: "Midnight Drive" — a moody E-minor night-drive groove.
 *
 * Shows off the studio-feel engine: light swing + humanized timing, a physically
 * modeled acoustic guitar, an e-piano with chorus, a delayed lead, lush hall reverb,
 * and a drum mix-group bus. Arrangement builds intro -> verse -> chorus.
 */
import { Song, Section, Track, Progression, Arp, Note, Pattern, Effect } from "codesong";

// i - VI - III - VII in E minor — the classic wistful loop.
const LOOP = ["Em", "Cmaj7", "G", "D"];

export default (
  <Song title="Midnight Drive" tempo={84} keySignature="E minor" timeSignature={[4, 4]} seed={7} swing={0.22} room="hall">
    {/* ---- INTRO: pad + e-piano arpeggio, spacious ---- */}
    <Section name="intro" bars={4}>
      <Track name="pad" instrument="pad" gain={0.28} pan={0.15} reverb={0.6} octave={3} loop>
        <Progression chords={LOOP} dur="1n" />
      </Track>
      <Track name="keys" instrument="electric-piano" gain={0.5} pan={-0.12} reverb={0.4} octave={4} loop>
        <Effect type="chorus" rate={0.7} depth={5} mix={0.3} />
        <Arp chord="Em" pattern="up" step="8n" length="1n" />
        <Arp chord="Cmaj7" pattern="up" step="8n" length="1n" />
        <Arp chord="G" pattern="up" step="8n" length="1n" />
        <Arp chord="D" pattern="up" step="8n" length="1n" />
      </Track>
    </Section>

    {/* ---- VERSE: groove drops in — guitar, bass, drums ---- */}
    <Section name="verse" bars={8}>
      <Track name="pad" instrument="pad" gain={0.22} pan={0.15} reverb={0.6} octave={3} loop>
        <Progression chords={LOOP} dur="1n" />
      </Track>
      <Track name="keys" instrument="electric-piano" gain={0.5} pan={-0.12} reverb={0.4} octave={4} loop>
        <Effect type="chorus" rate={0.7} depth={5} mix={0.3} />
        <Progression chords={LOOP} dur="1n" strum="down" />
      </Track>
      <Track name="gtr" instrument="acoustic-guitar" gain={0.32} pan={0.3} reverb={0.3} octave={3} loop>
        <Progression chords={LOOP} dur="2n" strum="down" />
      </Track>
      <Track name="bass" instrument="bass" gain={0.85} octave={2} loop>
        <Progression chords={LOOP} dur="1n" voicing="root" />
      </Track>
      <Track name="pedal" instrument="bass" gain={0.3} octave={1} reverb={0.15} loop>
        {/* Low E drone — anchors the harmony in E minor under the moving chords. */}
        <Note pitch="E2" dur="1n" />
      </Track>
      <Track name="drums" instrument="drums" gain={0.8} bus="beat" loop>
        <Pattern steps="bd ~ ~ ~ sd ~ ~ ~" dur="8n" velocity={0.85} />
        <Pattern steps="hh ~ hh ~ hh ~ hh ~" dur="8n" velocity={0.4} />
      </Track>
    </Section>

    {/* ---- CHORUS: full band + strings pad + delayed lead melody ---- */}
    <Section name="chorus" bars={8}>
      <Track name="keys" instrument="electric-piano" gain={0.5} pan={-0.12} reverb={0.4} octave={4} loop>
        <Effect type="chorus" rate={0.7} depth={5} mix={0.3} />
        <Progression chords={LOOP} dur="1n" strum="down" />
      </Track>
      <Track name="gtr" instrument="acoustic-guitar" gain={0.34} pan={0.3} reverb={0.3} octave={3} loop>
        <Progression chords={LOOP} dur="2n" strum="down" />
      </Track>
      <Track name="strings" instrument="strings" gain={0.26} pan={-0.25} reverb={0.55} octave={4} loop>
        <Progression chords={LOOP} dur="1n" />
      </Track>
      <Track name="bass" instrument="bass" gain={0.85} octave={2} loop>
        <Progression chords={LOOP} dur="1n" voicing="root" />
      </Track>
      <Track name="pedal" instrument="bass" gain={0.3} octave={1} reverb={0.15} loop>
        {/* Low E drone — anchors the harmony in E minor under the moving chords. */}
        <Note pitch="E2" dur="1n" />
      </Track>
      <Track name="drums" instrument="drums" gain={0.8} bus="beat" loop>
        <Pattern steps="bd ~ ~ bd sd ~ ~ ~" dur="8n" velocity={0.9} />
        <Pattern steps="hh hh hh hh hh hh hh oh" dur="8n" velocity={0.45} />
      </Track>
      <Track name="lead" instrument="lead" gain={0.34} pan={0.2} reverb={0.4} octave={5} loop>
        <Effect type="delay" time="4n." feedback={0.32} mix={0.3} />
        {/* Bar per chord: Em / Cmaj7 / G / D, twice. Leans on tonic E + dominant B, with
            a D# leading tone resolving up to E — the cadence that says "E minor", not G. */}
        <Note pitch="E5" dur="4n" /><Note pitch="B5" dur="4n" /><Note pitch="E5" dur="2n" />
        <Note pitch="E5" dur="4n" /><Note pitch="G5" dur="4n" /><Note pitch="E5" dur="2n" />
        <Note pitch="D5" dur="4n" /><Note pitch="B4" dur="4n" /><Note pitch="G4" dur="2n" />
        <Note pitch="F#5" dur="4n" /><Note pitch="A5" dur="4n" /><Note pitch="D#5" dur="4n" /><Note pitch="E5" dur="4n" />
        <Note pitch="B4" dur="4n" /><Note pitch="E5" dur="4n" /><Note pitch="B5" dur="2n" />
        <Note pitch="C5" dur="4n" /><Note pitch="B4" dur="4n" /><Note pitch="G4" dur="2n" />
        <Note pitch="D5" dur="4n" /><Note pitch="B4" dur="4n" /><Note pitch="G4" dur="2n" />
        <Note pitch="F#5" dur="4n" /><Note pitch="D#5" dur="4n" /><Note pitch="E5" dur="2n" />
      </Track>
    </Section>
  </Song>
);
