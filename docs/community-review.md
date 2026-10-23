# Community review: optional map SDK loading

This note is prepared for review. It has not been sent to Obsidian support.

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
