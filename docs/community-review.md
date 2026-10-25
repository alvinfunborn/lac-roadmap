# Community review: optional map SDK loading

Submitted to Obsidian support on 2026-10-23 through Roadmap's **Get help →
A review flagged something incorrectly** form. The request covers both entries
below and is visible under **Your Help Requests** with status **open**.
No manual approval or response has been received yet.

## Entries and releases

- LaC.LifeFlow: https://community.obsidian.md/plugins/lac-lifeflow
  - Source: https://github.com/alvinfunborn/lac-lifeflow
  - Release 1.0.2 fixes the undescribed ESLint directive reported for 1.0.1.
- LaC.Roadmap: https://community.obsidian.md/plugins/lac-roadmap
  - Source: https://github.com/alvinfunborn/lac-roadmap
  - Release 1.4.10 fixes the undescribed ESLint directive reported for 1.4.9.
  - The MIT LICENSE file is now present on the default branch.

## Review finding

The automated review reports an error under Code obfuscation:

> Code creates script elements at runtime

The finding identifies intentional loading of the official Google Maps and
AMap JavaScript SDKs. It is not a claim that the finding is technically false.

## Implementation and disclosure

Both plugins default to map provider `none`. Users must choose a provider and
configure their own API keys to enable maps. The script URL origins and paths
are fixed in source:

- `https://maps.googleapis.com/maps/api/js`
- `https://webapi.amap.com/maps`

Loader implementations are in `components/map/GoogleMap.tsx` and
`components/map/Amap.tsx` in each repository. The SDKs provide interactive maps,
markers, location selection and provider-specific map controls. Roadmap also
uses route overlays. Network access, required provider keys/accounts and
possible provider charges are disclosed in both English and Chinese READMEs.
Both directory listings are marked Optional payment.

The SDKs run in the plugin's document, so this is executable remote code, not
just downloading map tiles. Renaming or concealing the loader would not resolve
that security property and is not the proposed solution.

## Request for guidance

Can fixed-origin official map SDK loading be manually reviewed for these two
entries? If this capability is disallowed for new plugins, please confirm the
supported integration model. Replacing it with a bundled renderer and REST
services would require validating the existing Google/AMap interactions, map
types, coordinate conversions, place search and route overlays before release.

The aim is to meet the directory's security requirements while preserving
working map functionality. No exception or manual approval has been obtained.

## Submission readiness follow-up — 2026-10-25

The original request above remains open, with no response visible in the
management page on 2026-10-25. It names the original releases; the current
follow-up releases are LifeFlow **1.0.3** and Roadmap **1.4.11**.

- Roadmap 1.4.11 fixes an offline-setting mismatch: static thumbnails and
  route calculation could still use a saved Google key when None was selected.
  None now takes precedence over saved trip overrides at map and routing entry
  points. Enabling maps still supports trip-specific Google/AMap selection.
- READMEs now distinguish plugin data storage from the search terms, viewport
  coordinates, IP address and keys sent to providers. They disclose static
  previews and edit/reorder-triggered route requests, provider billing, and
  unencrypted settings that vault backup/sync tools may copy.
- Bundled dependencies now carry their full license notices in the source
  repository and distributed main.js, including for CostSet 1.0.2.
- Loader code is unchanged. Fixed entry URLs do not pin downstream SDK code,
  and these disclosures do not resolve the scanner's dynamic-script error.
- To verify offline behavior with existing keys: select None, restart Obsidian,
  open a trip with a saved provider override and coordinates, and edit/reorder
  places. Thumbnails/SDKs must not start and automatic routes must not be
  requested; local editing must still work. After opting in, map previews and
  provider overrides remain available. Automated regression tests cover these
  map/routing boundaries; real-device SDK interaction is a separate manual check.

The request is still for an explicit ruling on the current SDK integration,
not an assertion that documentation or successful unit tests constitutes
manual approval.
