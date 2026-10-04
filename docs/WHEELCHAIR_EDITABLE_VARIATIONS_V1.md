# Editable wheelchair variations v1

This release supports a deliberately bounded set of eight editor combinations: two appearances (`warm-curly-dark`, `deep-braids-black`), two age bands (`5-6`, `7-8`), and two relative heights (`average`, `taller`). Every combination uses the same teal-frame, charcoal-seat, orange-hub wheelchair and one of twelve movement-neutral seated poses.

Age and relative-height choices change the actual composed child-and-chair scale. The compositor only downsizes native transparent art: ages 5–6 use `0.88`, ages 7–8 use `1.0`, average height uses `0.94`, and taller uses `1.0`. No supported combination enlarges raster artwork.

The editor, saved profile, server validation, personalized-book manifest, and review compositor share exact profile keys in the form `appearance:age-band:relative-height:wheelchair`. Unsupported appearance, age, and height controls are disabled while wheelchair is selected, and unsupported submitted payloads are rejected server-side.

Preview/editing is public for supported profiles. Print ordering remains disabled until every final composed page receives human approval, provider validation succeeds for the exact final files, and a physical proof is reviewed. This release does not authorize a paid proof or binding order.

Review evidence is generated under `output/wheelchair-customization-v1/`; committed page metrics live in `docs/wheelchair-profile-manifests/`.
