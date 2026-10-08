// Layered "live sketch" of the child character. Every editor choice maps to a
// layer, CSS variable, or data attribute, so the sketch always matches the
// current selections instantly (the painted character is made on Create).
// Each instance gets its own gradient ids so thumbnails, the phone
// mini-preview, and the main stage can show different choices at once.
(() => {
  let instanceCount = 0;
  const palettes = {
    skinTone: {
      porcelain: ["#f8dccb", "#e5b9a0", "#f0a39b"], light: ["#f3cdb5", "#dca98a", "#ed9e95"], peach: ["#efbf98", "#d39770", "#e98f84"],
      golden: ["#dda06f", "#bd7950", "#cf746f"], olive: ["#c79a6c", "#a3784d", "#c47a68"], medium: ["#b9724f", "#945137", "#b85f61"],
      tan: ["#a3633d", "#82492b", "#ad5a55"], warm: ["#8a4d35", "#683426", "#9d4f56"], deep: ["#593225", "#3d211a", "#7e3d4a"],
      rich: ["#43251b", "#2b1711", "#6e3340"],
    },
    hairColor: {
      black: ["#18151a", "#393039"], "dark-brown": ["#38231d", "#684438"], brown: ["#6b4028", "#a06b42"], auburn: ["#963f28", "#d26a3e"],
      red: ["#c4521f", "#ee8b4b"], blonde: ["#d8a83f", "#f2cf69"], platinum: ["#e6dcc0", "#fff8e4"],
    },
    eyeColor: { brown: "#6d3e27", hazel: "#9a7a32", green: "#43856d", blue: "#4989be", gray: "#7e8b98" },
    outfitColor: {
      teal: ["#168b91", "#49b8b3", "#0c6068"], orange: ["#e97832", "#f6a654", "#b94b1f"], purple: ["#7950b8", "#a77bd9", "#563185"],
      blue: ["#367cc2", "#67a4dd", "#23578e"], rose: ["#c85273", "#e7829d", "#923650"], green: ["#4b8b55", "#79b56f", "#32673b"],
    },
  };
  const costumeLegs = { pumpkin: "#2f3a2a", witch: "#3a2550", superhero: "#2c4a8a", dinosaur: "#4f8a3a", astronaut: "#e3e9ef", cat: "#232026" };

  function markup(uid) {
    const id = (name) => `cs${uid}-${name}`;
    const url = (name) => `url(#${id(name)})`;
    return `
    <svg class="custom-child-svg" viewBox="0 0 360 560" role="img" aria-label="Live sketch of the child character" focusable="false">
      <defs>
        <filter id="${id("shadow")}" x="-35%" y="-35%" width="170%" height="190%"><feDropShadow dx="0" dy="12" stdDeviation="11" flood-color="#24102f" flood-opacity=".28"/></filter>
        <linearGradient id="${id("skin")}" x1=".12" y1=".02" x2=".9" y2=".96"><stop offset="0" stop-color="var(--skin)"/><stop offset=".48" stop-color="var(--skin)"/><stop offset="1" stop-color="var(--skin-shadow)"/></linearGradient>
        <radialGradient id="${id("face")}" cx="38%" cy="25%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".52" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="var(--skin-shadow)" stop-opacity=".2"/></radialGradient>
        <linearGradient id="${id("hair")}" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="var(--hair-light)"/><stop offset=".5" stop-color="var(--hair)"/><stop offset="1" stop-color="var(--hair)"/></linearGradient>
        <linearGradient id="${id("outfit")}" x1=".12" y1="0" x2=".88" y2="1"><stop offset="0" stop-color="var(--outfit-light)"/><stop offset=".5" stop-color="var(--outfit)"/><stop offset="1" stop-color="var(--outfit-dark)"/></linearGradient>
        <radialGradient id="${id("iris")}" cx="35%" cy="28%" r="72%"><stop offset="0" stop-color="#fff" stop-opacity=".65"/><stop offset=".22" stop-color="var(--eye)"/><stop offset=".82" stop-color="var(--eye)"/><stop offset="1" stop-color="#161018"/></radialGradient>
      </defs>
      <ellipse class="character-ground" cx="184" cy="526" rx="112" ry="18" fill="#392354" opacity=".12"/>
      <g class="layer costume-back costume-witch"><path d="M120 292c-30 60-44 140-50 214h228c-6-74-20-154-50-214z" fill="#2d1d45"/></g>
      <g class="layer costume-back costume-superhero"><path d="M124 290c-26 66-40 140-44 222l104-22 104 22c-4-82-18-156-44-222z" fill="#d23a3a"/></g>
      <g class="layer costume-back costume-dinosaur"><path d="M232 430c40 6 74 30 92 70-30-8-62-16-96-38z" fill="#5c9e45"/></g>
      <g class="layer costume-back costume-cat"><path d="M236 440c48 4 66-34 58-70" fill="none" stroke="#232026" stroke-width="13" stroke-linecap="round"/></g>
      <g class="layer hair-back hair-back-ponytail"><path d="M246 118c40 14 60 56 52 104-4 30-22 52-40 60 10-30 8-62-6-90z" fill="${url("hair")}"/><circle cx="247" cy="122" r="11" fill="var(--outfit-light)"/></g>
      <g class="wheelchair-art layer">
        <path d="M128 304v-30M240 304v-30" stroke="#31546b" stroke-width="9" stroke-linecap="round"/>
        <path d="M118 270h18M232 270h18" stroke="#1f3646" stroke-width="11" stroke-linecap="round"/>
        <rect x="124" y="296" width="120" height="104" rx="14" fill="#3d6680"/>
        <g class="wheel wheel-left"><ellipse cx="88" cy="418" rx="23" ry="74" fill="#f2f7f9" stroke="#31546b" stroke-width="10"/><ellipse cx="88" cy="418" rx="14" ry="60" fill="none" stroke="#9db3be" stroke-width="4"/><path d="M88 360v116M76 418h24" stroke="#b7c7cf" stroke-width="3"/><circle cx="88" cy="418" r="6" fill="#31546b"/></g>
        <g class="wheel wheel-right"><ellipse cx="280" cy="418" rx="23" ry="74" fill="#f2f7f9" stroke="#31546b" stroke-width="10"/><ellipse cx="280" cy="418" rx="14" ry="60" fill="none" stroke="#9db3be" stroke-width="4"/><path d="M280 360v116M268 418h24" stroke="#b7c7cf" stroke-width="3"/><circle cx="280" cy="418" r="6" fill="#31546b"/></g>
        <path d="M120 400h128" stroke="#31546b" stroke-width="12" stroke-linecap="round"/>
        <path d="M130 404l-6 80M238 404l6 80" stroke="#31546b" stroke-width="8" stroke-linecap="round"/>
        <rect x="112" y="478" width="144" height="11" rx="5" fill="#31546b"/>
        <circle cx="122" cy="494" r="9" fill="#f2f7f9" stroke="#31546b" stroke-width="5"/><circle cx="246" cy="494" r="9" fill="#f2f7f9" stroke="#31546b" stroke-width="5"/>
      </g>
      <g class="custom-child-figure" filter="${url("shadow")}">
        <g class="layer seated-legs">
          <path d="M132 392h104l4 34c-8 6-20 8-32 6h-44c-12 2-24 0-32-6z" fill="var(--legs)"/>
          <path class="seated-shorts" d="M130 392h108l3 30c-9 5-21 7-33 5h-48c-12 2-23 0-32-5z" fill="var(--outfit-dark)"/>
          <path d="M138 424h38l-2 40h-34zM192 424h38l-2 40h-34z" fill="var(--legs)"/>
          <path d="M130 474c0-11 11-18 26-18s26 7 26 18v2c0 4-3 6-7 6h-38c-4 0-7-2-7-6zM186 474c0-11 11-18 26-18s26 7 26 18v2c0 4-3 6-7 6h-38c-4 0-7-2-7-6z" fill="#f7f3ee" stroke="#d3cbc3" stroke-width="3"/>
          <path d="M131 475h50v2c0 3-3 5-6 5h-38c-3 0-6-2-6-5zM187 475h50v2c0 3-3 5-6 5h-38c-3 0-6-2-6-5z" fill="#ded6ea"/>
        </g>
        <g class="character-legs">
          <path class="leg leg-left" d="M132 394l47 1-6 108h-43z" fill="var(--legs)"/>
          <path class="leg leg-right-upper" d="M184 395l47-1 6 56h-46z" fill="var(--legs)"/>
          <path class="leg leg-right-lower" d="M191 449h46l8 54h-43z" fill="var(--legs)"/>
          <g class="layer shorts-overlay"><path d="M128 392h112l4 52h-50l-10-26-10 26h-50z" fill="var(--outfit-dark)"/></g>
          <g class="shoe shoe-left" transform="translate(0 0)"><path d="M120 517c0-15 13-26 31-26s31 11 31 26v4c0 5-3 8-8 8h-46c-5 0-8-3-8-8z" fill="#f7f3ee" stroke="#d3cbc3" stroke-width="3"/><path d="M121 518h60v3c0 5-3 7-7 7h-46c-4 0-7-2-7-7z" fill="#ded6ea"/><path d="M143 502h16M141 509h20" fill="none" stroke="#cdc4bb" stroke-width="3" stroke-linecap="round"/></g>
          <g class="shoe shoe-right" transform="translate(76 0)"><path d="M120 517c0-15 13-26 31-26s31 11 31 26v4c0 5-3 8-8 8h-46c-5 0-8-3-8-8z" fill="#f7f3ee" stroke="#d3cbc3" stroke-width="3"/><path d="M121 518h60v3c0 5-3 7-7 7h-46c-4 0-7-2-7-7z" fill="#ded6ea"/><path d="M143 502h16M141 509h20" fill="none" stroke="#cdc4bb" stroke-width="3" stroke-linecap="round"/></g>
          <g class="layer aid-prosthetic"><rect x="196" y="440" width="40" height="26" rx="11" fill="#c9d2da" stroke="#7b8b99" stroke-width="3"/><rect x="210" y="462" width="12" height="36" rx="5" fill="#9aa7b3" stroke="#6f7d8a" stroke-width="2"/></g>
          <g class="layer aid-braces" fill="#eef6fb" stroke="#6f9cbc" stroke-width="3"><path d="M134 446h40l-3 50h-36z"/><path d="M194 446h40l4 50h-38z"/><path d="M134 460h40M134 482h38M195 460h40M197 482h39" stroke="var(--outfit)" stroke-width="5"/></g>
        </g>
        <g class="character-arms">
          <path d="M125 291c-27 19-40 58-39 101 0 18 28 19 30 1 1-31 11-56 30-70zM232 290c29 18 45 52 49 91 2 18-25 23-30 5-5-28-16-50-38-62z" fill="${url("skin")}"/>
          <g class="long-sleeves"><path d="M125 291c-27 19-40 58-39 96l30 4c1-31 11-54 30-68zM232 290c29 18 45 52 49 88l-30 6c-5-28-16-48-38-60z" fill="var(--sleeve)"/></g>
          <circle cx="99" cy="397" r="17" fill="${url("skin")}"/><circle cx="266" cy="390" r="17" fill="${url("skin")}"/>
        </g>
        <path class="character-neck" d="M157 246h52v66h-52z" fill="var(--skin-shadow)"/>
        <g class="layer outfit outfit-tee outfit-shorts"><path d="M126 285c17-14 42-22 58-22s42 8 58 22l-14 110h-87z" fill="${url("outfit")}"/><path d="M127 286l-19 44 29 12 15-45zM240 286l22 40-27 15-18-44z" fill="var(--outfit-light)"/><path d="M164 271c5 12 35 12 40 0" fill="none" stroke="var(--outfit-dark)" stroke-width="7" stroke-linecap="round"/></g>
        <g class="layer outfit outfit-overalls"><path d="M128 285c17-14 39-21 56-21 18 0 41 7 57 21l-12 111h-89z" fill="var(--outfit-light)"/><path d="M143 301h82l8 106h-96z" fill="${url("outfit")}"/><path d="M151 272l19 66M217 272l-18 66" fill="none" stroke="var(--outfit-dark)" stroke-width="10" stroke-linecap="round"/><path d="M164 324h41v39h-41z" fill="var(--outfit-light)" stroke="var(--outfit-dark)" stroke-width="4"/><circle cx="169" cy="335" r="5" fill="#ffd86a"/><circle cx="201" cy="335" r="5" fill="#ffd86a"/></g>
        <g class="layer outfit outfit-hoodie"><path d="M124 295c12-21 35-32 60-32 26 0 48 11 61 32l-12 113h-97z" fill="${url("outfit")}"/><path d="M151 281c3 24 63 24 66 0M181 303v56" fill="none" stroke="var(--outfit-dark)" stroke-width="6" stroke-linecap="round"/><path d="M153 364c19 12 45 12 64 0" fill="none" stroke="var(--outfit-light)" stroke-width="12" stroke-linecap="round"/></g>
        <g class="layer outfit outfit-dress"><path d="M151 272h66l10 82 40 81H103l38-81z" fill="${url("outfit")}"/><path d="M160 274c6 14 42 14 48 0M133 399c34 13 70 13 103 0" fill="none" stroke="var(--outfit-light)" stroke-width="7" stroke-linecap="round"/><circle cx="184" cy="337" r="9" fill="var(--outfit-light)"/></g>
        <g class="layer outfit outfit-sweater"><path d="M124 292c14-18 36-28 60-28 25 0 47 10 61 28l-10 112h-101z" fill="${url("outfit")}"/><path d="M158 270c8 12 44 12 52 0" fill="none" stroke="var(--outfit-dark)" stroke-width="9" stroke-linecap="round"/><path d="M130 392h108" stroke="var(--outfit-dark)" stroke-width="10" stroke-linecap="round"/><path d="M146 318l14 14 14-14 14 14 14-14 14 14" fill="none" stroke="var(--outfit-light)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>
        <g class="layer outfit outfit-jacket"><path d="M122 292c14-19 37-29 62-29s48 10 62 29l-8 120h-108z" fill="${url("outfit")}"/><path d="M184 272v138" stroke="var(--outfit-dark)" stroke-width="5"/><path d="M150 270l34 22 34-22" fill="none" stroke="var(--outfit-dark)" stroke-width="7" stroke-linejoin="round"/><rect x="138" y="352" width="30" height="22" rx="5" fill="var(--outfit-dark)" opacity=".5"/><rect x="200" y="352" width="30" height="22" rx="5" fill="var(--outfit-dark)" opacity=".5"/><circle cx="184" cy="318" r="4" fill="#ffd86a"/><circle cx="184" cy="350" r="4" fill="#ffd86a"/></g>
        <g class="layer costume costume-pumpkin"><ellipse cx="184" cy="350" rx="84" ry="74" fill="#ee8a2c"/><path d="M152 282c-18 40-18 100 0 140M216 282c18 40 18 100 0 140M184 278v146" fill="none" stroke="#c9601a" stroke-width="6" stroke-linecap="round"/><path d="M154 276c12 10 48 10 60 0l-6-14h-48z" fill="#3f8a3a"/><path d="M160 340l12-12 12 12zM190 340l12-12 12 12zM158 372c16 14 36 14 52 0-8 10-44 10-52 0z" fill="#3a2410"/></g>
        <g class="layer costume costume-witch"><path d="M150 272h68l14 70 40 104H96l40-104z" fill="#4a2d73"/><path d="M152 274c8 14 56 14 64 0" fill="none" stroke="#7f5cc0" stroke-width="7" stroke-linecap="round"/><path d="M174 330l10-18 10 18-10 18z" fill="#ffd86a"/></g>
        <g class="layer costume costume-superhero"><path d="M126 285c17-14 42-22 58-22s42 8 58 22l-14 110h-87z" fill="#2f63c9"/><path d="M127 286l-19 44 29 12 15-45zM240 286l22 40-27 15-18-44z" fill="#2856b0"/><path d="M184 306l9 18 20 3-14 14 3 20-18-9-18 9 3-20-14-14 20-3z" fill="#ffd23f" stroke="#d23a3a" stroke-width="3"/><rect x="138" y="378" width="92" height="12" rx="5" fill="#ffd23f"/></g>
        <g class="layer costume costume-dinosaur"><path d="M124 295c12-21 35-32 60-32 26 0 48 11 61 32l-12 113h-97z" fill="#5c9e45"/><ellipse cx="184" cy="350" rx="36" ry="48" fill="#cfe7a8"/><path d="M168 318h32M164 340h40M166 362h36" stroke="#a9cc80" stroke-width="4"/></g>
        <g class="layer costume costume-astronaut"><path d="M122 292c14-19 37-29 62-29s48 10 62 29l-8 120h-108z" fill="#eef2f6"/><path d="M146 272c10 14 66 14 76 0" fill="none" stroke="#9aa7b3" stroke-width="10" stroke-linecap="round"/><rect x="158" y="318" width="52" height="38" rx="8" fill="#c9d2da"/><circle cx="172" cy="337" r="6" fill="#e5534b"/><circle cx="196" cy="337" r="6" fill="#367cc2"/><rect x="134" y="300" width="22" height="14" rx="3" fill="#367cc2"/></g>
        <g class="layer costume costume-cat"><path d="M124 295c12-21 35-32 60-32 26 0 48 11 61 32l-12 113h-97z" fill="#2b2730"/><ellipse cx="184" cy="350" rx="30" ry="40" fill="#46404d"/><path d="M162 272c6 10 38 10 44 0" fill="none" stroke="#e46a8c" stroke-width="7" stroke-linecap="round"/><circle cx="184" cy="286" r="6" fill="#ffd23f"/></g>
        <g class="character-head">
          <ellipse class="ears" cx="109" cy="188" rx="23" ry="30" fill="${url("skin")}"/><ellipse class="ears" cx="257" cy="188" rx="23" ry="30" fill="${url("skin")}"/>
          <ellipse cx="183" cy="176" rx="78" ry="91" fill="${url("skin")}"/>
          <ellipse cx="183" cy="176" rx="76" ry="89" fill="${url("face")}"/>
          <path d="M130 130c17-31 43-44 72-40" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".13"/>
          <g class="eyes">
            <ellipse cx="160" cy="181" rx="17" ry="19" fill="#fffdf9"/><ellipse cx="206" cy="181" rx="17" ry="19" fill="#fffdf9"/>
            <ellipse cx="161" cy="183" rx="11.5" ry="13.5" fill="${url("iris")}"/><ellipse cx="207" cy="183" rx="11.5" ry="13.5" fill="${url("iris")}"/>
            <ellipse cx="161" cy="185" rx="5.5" ry="6.5" fill="#17131a"/><ellipse cx="207" cy="185" rx="5.5" ry="6.5" fill="#17131a"/>
            <circle cx="157" cy="178" r="3.6" fill="#fff"/><circle cx="203" cy="178" r="3.6" fill="#fff"/><circle cx="165" cy="189" r="1.7" fill="#fff" opacity=".72"/><circle cx="211" cy="189" r="1.7" fill="#fff" opacity=".72"/>
            <path d="M143 176c4-11 11-16 17-16s14 5 18 16M189 176c4-11 11-16 17-16s14 5 18 16" fill="none" stroke="#3a2630" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>
          </g>
          <path d="M144 154c7-6 17-8 27-5M196 149c10-3 20-1 27 5" fill="none" stroke="var(--brow)" stroke-width="6" stroke-linecap="round"/>
          <g class="layer presentation-detail presentation-girl" fill="none" stroke="var(--brow)" stroke-width="3" stroke-linecap="round"><path d="M144 172l-6-3M147 166l-4-6M222 172l6-3M219 166l4-6"/></g>
          <path d="M183 179c-3 13-6 24 3 29 5 2 10 0 13-3" fill="none" stroke="var(--skin-shadow)" stroke-width="4" stroke-linecap="round" opacity=".72"/>
          <ellipse cx="136" cy="214" rx="17" ry="8" fill="var(--blush)" opacity=".43"/><ellipse cx="232" cy="214" rx="17" ry="8" fill="var(--blush)" opacity=".43"/>
          <g class="layer face-freckles" fill="var(--freckle)"><circle cx="138" cy="203" r="2.4"/><circle cx="147" cy="208" r="2"/><circle cx="133" cy="212" r="2"/><circle cx="144" cy="216" r="2.2"/><circle cx="229" cy="203" r="2.4"/><circle cx="220" cy="208" r="2"/><circle cx="234" cy="212" r="2"/><circle cx="223" cy="216" r="2.2"/><circle cx="177" cy="196" r="1.8"/><circle cx="190" cy="196" r="1.8"/></g>
          <g class="layer face-birthmark"><path d="M232 230c4-6 13-6 15 0 3 6-3 12-9 11-6 0-9-6-6-11z" fill="var(--freckle)" opacity=".7"/></g>
          <path d="M153 224c17 22 45 22 62 0-10 6-20 9-31 9s-21-3-31-9z" fill="#fbf7f4" stroke="#8f3d4b" stroke-width="4" stroke-linejoin="round"/>
          <path d="M162 226c15 7 30 7 44 0" fill="none" stroke="#d8848c" stroke-width="3" stroke-linecap="round" opacity=".72"/>
        </g>
        <g class="layer hair hair-short"><path d="M111 164c-9-58 22-98 73-98 50 0 80 38 70 94-13-26-31-39-55-49-16 26-48 39-88 53z" fill="${url("hair")}"/><path d="M126 116c31-32 73-41 108-14" fill="none" stroke="var(--hair-light)" stroke-width="12" stroke-linecap="round" opacity=".65"/></g>
        <g class="layer hair hair-curly" fill="${url("hair")}"><circle cx="121" cy="117" r="31"/><circle cx="150" cy="89" r="34"/><circle cx="188" cy="78" r="35"/><circle cx="226" cy="91" r="34"/><circle cx="251" cy="121" r="31"/><circle cx="111" cy="151" r="26"/><circle cx="258" cy="153" r="26"/><path d="M113 157c15-31 39-48 72-48s57 16 72 48c-22-7-40-22-56-42-18 25-48 39-88 42z"/></g>
        <g class="layer hair hair-coils" fill="${url("hair")}"><circle cx="112" cy="116" r="25"/><circle cx="132" cy="91" r="26"/><circle cx="160" cy="76" r="27"/><circle cx="190" cy="72" r="28"/><circle cx="220" cy="80" r="27"/><circle cx="245" cy="99" r="26"/><circle cx="258" cy="128" r="25"/><circle cx="106" cy="146" r="23"/><circle cx="263" cy="155" r="23"/><circle cx="136" cy="126" r="25"/><circle cx="172" cy="111" r="26"/><circle cx="210" cy="113" r="26"/><circle cx="241" cy="134" r="24"/></g>
        <g class="layer hair hair-wavy"><path d="M102 175c-5-73 30-111 84-111 55 0 88 42 80 116l-22 72-15-81c-3-22-15-40-32-55-19 25-48 42-85 47l-8 89z" fill="${url("hair")}"/><path d="M119 122c22-31 50-45 83-40 30 4 48 22 57 52" fill="none" stroke="var(--hair-light)" stroke-width="13" stroke-linecap="round" opacity=".65"/></g>
        <g class="layer hair hair-straight"><path d="M105 170c-4-69 25-106 80-106 55 0 84 38 80 106l-10 111-28-39 4-92c-13-9-27-22-39-39-18 24-45 39-81 45l4 88-27 37z" fill="${url("hair")}"/><path d="M122 118c30-28 69-39 109-22" fill="none" stroke="var(--hair-light)" stroke-width="11" stroke-linecap="round" opacity=".6"/></g>
        <g class="layer hair hair-braids"><path d="M109 157c-6-63 25-94 77-94 51 0 82 33 75 96-19-18-37-32-61-45-16 25-48 39-91 43z" fill="${url("hair")}"/><path d="M111 146c-10 48-8 91 7 125M258 146c10 48 8 91-7 125" fill="none" stroke="var(--hair)" stroke-width="19" stroke-linecap="round" stroke-dasharray="14 7"/><circle cx="119" cy="277" r="9" fill="var(--outfit-light)"/><circle cx="250" cy="277" r="9" fill="var(--outfit-light)"/></g>
        <g class="layer hair hair-locs"><path d="M109 160c-7-62 24-96 76-96 51 0 81 34 75 96-18-24-42-38-75-40-32 2-58 16-76 40z" fill="${url("hair")}"/><g fill="none" stroke="var(--hair)" stroke-width="15" stroke-linecap="round"><path d="M112 140c-8 40-6 86 2 124M128 124c-6 30-4 60 0 84M240 124c6 30 4 60 0 84M256 140c8 40 6 86-2 124"/></g><g fill="none" stroke="var(--hair-light)" stroke-width="3" stroke-linecap="round" opacity=".55"><path d="M108 170l10 4M110 196l10 4M112 222l10 4M250 170l10-4M252 196l10-4M250 222l10-4"/></g></g>
        <g class="layer hair hair-ponytail"><path d="M107 166c-6-66 26-102 78-102 52 0 83 36 77 100-15-26-38-44-70-50-20 22-49 38-85 52z" fill="${url("hair")}"/><path d="M124 116c30-30 72-38 110-16" fill="none" stroke="var(--hair-light)" stroke-width="11" stroke-linecap="round" opacity=".6"/></g>
        <g class="layer hair hair-puffs"><g class="puff-balls" fill="${url("hair")}"><circle cx="104" cy="96" r="40"/><circle cx="262" cy="96" r="40"/></g><path d="M110 160c-6-56 24-90 75-90 50 0 80 34 74 90-16-22-42-36-74-36s-58 14-75 36z" fill="${url("hair")}"/><g class="puff-balls" fill="none" stroke="var(--hair-light)" stroke-width="4" stroke-linecap="round" opacity=".5"><path d="M86 84c6-10 18-16 30-14M246 84c6-10 18-16 30-14"/></g></g>
        <g class="layer hair hair-buzz"><path d="M107 158c-3-55 28-80 76-80 48 0 79 25 76 80-12-24-38-40-76-40s-64 16-76 40z" fill="var(--hair)" opacity=".88"/><path d="M128 104c26-16 84-18 110 0" fill="none" stroke="var(--hair-light)" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 6" opacity=".55"/></g>
        <g class="layer glasses glasses-round" fill="#ffffff" fill-opacity=".12" stroke="#2b2233" stroke-width="4"><circle cx="160" cy="182" r="21"/><circle cx="206" cy="182" r="21"/><path d="M181 180c1-3 3-4 2-4M181 179c2-3 4-3 4 0M139 178l-26-5M227 178l26-5" fill="none" stroke-linecap="round"/></g>
        <g class="layer glasses glasses-square" fill="#ffffff" fill-opacity=".12" stroke="#2b2233" stroke-width="4"><rect x="138" y="164" width="42" height="34" rx="9"/><rect x="186" y="164" width="42" height="34" rx="9"/><path d="M180 178h6M138 176l-25-4M228 176l25-4" fill="none" stroke-linecap="round"/></g>
        <g class="layer hearing hearing-aids"><path d="M92 170c-8-18 6-30 18-24l-4 32z" fill="#3fb8c9" stroke="#1f6f7d" stroke-width="3"/><path d="M274 170c8-18-6-30-18-24l4 32z" fill="#3fb8c9" stroke="#1f6f7d" stroke-width="3"/><path d="M108 178c6 4 10 8 10 14M258 178c-6 4-10 8-10 14" fill="none" stroke="#1f6f7d" stroke-width="3" stroke-linecap="round"/></g>
        <g class="layer hearing hearing-cochlear"><path d="M253 166c-6 10-6 28 2 46" fill="none" stroke="#5e5650" stroke-width="2.5" stroke-linecap="round"/><path d="M262 162c12 6 14 30 6 52-2 6-9 6-10 0 4-18 4-34-2-44-3-6 1-10 6-8z" fill="#cfc6bb" stroke="#7d746b" stroke-width="3"/><path d="M262 163c-2-8-4-14-8-18" fill="none" stroke="#5e5650" stroke-width="2.5" stroke-linecap="round"/><circle cx="250" cy="140" r="10" fill="#d9d2c9" stroke="#7d746b" stroke-width="3"/><circle cx="250" cy="140" r="3" fill="#7d746b"/></g>
        <g class="layer headwear headwear-hijab"><path fill-rule="evenodd" d="M183 70c-74 0-96 70-92 130 3 50 18 90 28 118h128c10-28 25-68 28-118 4-60-18-130-92-130zM117 186a66 80 0 1 0 132 0a66 80 0 1 0-132 0z" fill="var(--headwear)"/><path d="M126 240c18 34 96 34 114 0M118 120c40-34 90-36 130 0" fill="none" stroke="var(--headwear-dark)" stroke-width="4" stroke-linecap="round" opacity=".55"/></g>
        <g class="layer headwear headwear-patka"><path d="M105 152c-2-56 34-84 78-84s80 28 78 84c-20-24-46-34-78-34s-58 10-78 34z" fill="var(--headwear)"/><ellipse cx="183" cy="72" rx="26" ry="20" fill="var(--headwear-dark)"/><path d="M118 126c30-28 100-28 130 0" fill="none" stroke="var(--headwear-dark)" stroke-width="4" opacity=".5"/></g>
        <g class="layer headwear headwear-headwrap"><path d="M100 158c-4-62 34-96 83-96s87 34 83 96c-22-28-50-38-83-38s-61 10-83 38z" fill="var(--headwear)"/><ellipse cx="160" cy="58" rx="34" ry="20" transform="rotate(-24 160 58)" fill="var(--headwear-dark)"/><ellipse cx="206" cy="58" rx="34" ry="20" transform="rotate(24 206 58)" fill="var(--headwear-dark)"/><circle cx="183" cy="66" r="13" fill="var(--headwear)"/><path d="M114 132c30-24 108-24 138 0M108 148c34-26 116-26 150 0" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="3 12" stroke-linecap="round" opacity=".5"/></g>
        <g class="layer headwear headwear-kippah"><path d="M154 82c6-16 52-16 58 0c-16-5-42-5-58 0z" fill="var(--headwear)" stroke="var(--headwear-dark)" stroke-width="2.5" stroke-linejoin="round"/><path d="M160 79c10-7 36-7 46 0" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 5" opacity=".55"/></g>
        <g class="layer headwear headwear-beanie"><path d="M101 160c-4-80 36-116 82-116s86 36 82 116z" fill="var(--headwear)"/><rect x="96" y="136" width="174" height="30" rx="14" fill="var(--headwear-dark)"/><circle cx="183" cy="42" r="17" fill="#fff4e6"/><path d="M130 136V90M156 136V68M183 136V58M210 136V68M236 136V90" stroke="var(--headwear-dark)" stroke-width="4" opacity=".4"/></g>
        <g class="layer headwear headwear-cap"><path d="M104 150c-4-62 34-92 79-92s83 30 79 92z" fill="var(--headwear)"/><path d="M100 150c30 22 136 22 166 0-4 14-10 22-18 24-40 8-90 8-130 0-8-2-14-10-18-24z" fill="var(--headwear-dark)"/><circle cx="183" cy="60" r="7" fill="var(--headwear-dark)"/><path d="M183 62v86" stroke="var(--headwear-dark)" stroke-width="3" opacity=".45"/></g>
        <g class="layer costume-head costume-witch"><ellipse cx="183" cy="96" rx="104" ry="18" fill="#2d1d45"/><path d="M128 94c20-40 38-74 70-92 4 30 10 60 34 92z" fill="#4a2d73"/><path d="M134 84c30 6 64 6 94 0" stroke="#ffd86a" stroke-width="8"/></g>
        <g class="layer costume-head costume-pumpkin"><path d="M178 70c-2-16 4-28 14-34l6 6c-8 6-10 16-8 28z" fill="#3f8a3a"/><path d="M190 52c14-10 30-8 38 2-14 4-26 4-38-2z" fill="#5fae4f"/></g>
        <g class="layer costume-head costume-dinosaur" fill="#5c9e45"><path d="M136 82l12-28 14 24zM166 66l16-30 16 30zM204 70l16-26 12 30zM234 90l18-20 6 30z"/></g>
        <g class="layer costume-head costume-cat"><path d="M114 112l8-58 42 34zM252 112l-8-58-42 34z" fill="#2b2730"/><path d="M124 96l4-28 20 16zM242 96l-4-28-20 16z" fill="#e46a8c"/></g>
        <g class="layer costume-head costume-astronaut"><path d="M100 160c-6-80 38-110 83-110s89 30 83 110" fill="none" stroke="#c9d2da" stroke-width="10" stroke-linecap="round" opacity=".85"/></g>
        <g class="layer aid-crutches" stroke-linecap="round"><path d="M96 352l-6 172M270 346l8 178" stroke="#7d8a99" stroke-width="9"/><path d="M82 352c4-14 22-14 26 0M258 346c4-14 22-14 26 0" fill="none" stroke="#3f8fa6" stroke-width="8"/><path d="M90 398h18M262 392h18" stroke="#3f8fa6" stroke-width="10"/><circle cx="90" cy="524" r="7" fill="#46505b"/><circle cx="278" cy="524" r="7" fill="#46505b"/></g>
        <g class="layer aid-walker" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M86 392l-6 128M282 386l8 134M84 446h204" stroke="#6d8aa3" stroke-width="9"/><path d="M80 392h28M262 386h28" stroke="#e36f4f" stroke-width="13"/><circle cx="80" cy="522" r="11" fill="#f7fbfb" stroke="#31546b" stroke-width="6"/><circle cx="290" cy="522" r="11" fill="#f7fbfb" stroke="#31546b" stroke-width="6"/></g>
      </g>
    </svg>`;
  }

  function create(profile) {
    instanceCount += 1;
    const template = document.createElement("template");
    template.innerHTML = markup(instanceCount).trim();
    const svg = template.content.firstElementChild;
    if (profile) apply(svg, profile);
    return svg;
  }

  function shade(hex, amount) {
    const value = Number.parseInt(hex.slice(1), 16);
    const channel = (shift) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * (1 + amount))));
    return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
  }

  /** Applies a compact profile to an SVG made by create(). */
  function apply(svg, profile = {}) {
    if (!svg) return;
    const skin = palettes.skinTone[profile.skinTone] || palettes.skinTone.medium;
    const hair = palettes.hairColor[profile.hairColor] || palettes.hairColor["dark-brown"];
    const outfit = palettes.outfitColor[profile.outfitColor] || palettes.outfitColor.teal;
    const costume = profile.outfitStyle === "costume" ? (profile.costume || "pumpkin") : "none";
    const headwear = profile.headwear || "none";
    const set = (name, value) => svg.style.setProperty(name, value);
    Object.assign(svg.dataset, {
      presentation: profile.presentation || "girl",
      hairStyle: profile.hairStyle || "curly",
      outfitStyle: profile.outfitStyle || "overalls",
      costume,
      mobility: profile.mobilityAid || "none",
      glasses: profile.glasses || "none",
      hearing: profile.hearingAid || "none",
      headwear,
      faceDetail: profile.faceDetail || "none",
    });
    set("--skin", skin[0]); set("--skin-shadow", skin[1]); set("--blush", skin[2]);
    set("--freckle", shade(skin[1], -0.28));
    set("--hair", hair[0]); set("--hair-light", hair[1]);
    set("--brow", profile.hairColor === "platinum" ? "#b8a98a" : hair[0]);
    set("--eye", palettes.eyeColor[profile.eyeColor] || palettes.eyeColor.brown);
    set("--outfit", outfit[0]); set("--outfit-light", outfit[1]); set("--outfit-dark", outfit[2]);
    // Headwear takes a soft color that complements the outfit.
    set("--headwear", headwear === "kippah" ? outfit[2] : outfit[1]);
    set("--headwear-dark", outfit[2]);
    const style = profile.outfitStyle;
    set("--legs", costume !== "none" ? costumeLegs[costume] : style === "sweater" ? "#3e5f8a" : style === "shorts" ? "var(--skin)" : outfit[2]);
    const costumeSleeves = { witch: "#4a2d73", dinosaur: "#5c9e45", astronaut: "#eef2f6", cat: "#2b2730" };
    set("--sleeve", costume !== "none" ? (costumeSleeves[costume] || "transparent") : style === "sweater" || style === "jacket" || style === "hoodie" ? outfit[0] : "transparent");
  }

  window.MonstersNowChildSketch = { create, apply, palettes };
})();
