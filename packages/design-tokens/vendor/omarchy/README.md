# Vendored Omarchy palettes

This directory holds ten Omarchy theme palettes, unmodified, as the input for Houston's palette
library. Each `<theme>/colors.toml` is a byte-for-byte copy of `themes/<theme>/colors.toml` from
[omacom/omarchy](https://github.com/omacom/omarchy) at commit
`28ceaae70ebac3a0edcc21f2faa77a90dc6d404c` (branch `quattro`).

| Theme | Mode |
| --- | --- |
| `catppuccin-latte` | light |
| `flexoki-light` | light |
| `rose-pine` | light (Omarchy ships Rosé Pine Dawn) |
| `lupine` | light |
| `white` | light |
| `tokyo-night` | dark |
| `catppuccin` | dark |
| `nord` | dark |
| `gruvbox` | dark |
| `everforest` | dark |

## Licence

Omarchy is MIT licensed, copyright David Heinemeier Hansson. The full text sits beside this file in
`LICENSE`.

## Upstream palette attribution

The colour values Omarchy packages come from these upstream palettes:

| Theme | Upstream | Licence |
| --- | --- | --- |
| `catppuccin-latte`, `catppuccin` | [catppuccin/catppuccin](https://github.com/catppuccin/catppuccin) | MIT |
| `flexoki-light` | [kepano/flexoki](https://github.com/kepano/flexoki) | MIT |
| `rose-pine` | [rose-pine/rose-pine-palette](https://github.com/rose-pine/rose-pine-palette) | MIT |
| `tokyo-night` | [folke/tokyonight.nvim](https://github.com/folke/tokyonight.nvim) | Apache-2.0 |
| `nord` | [nordtheme/nord](https://github.com/nordtheme/nord) | MIT |
| `gruvbox` | [sainnhe/gruvbox-material](https://github.com/sainnhe/gruvbox-material) | MIT |
| `everforest` | [sainnhe/everforest](https://github.com/sainnhe/everforest) | MIT |
| `lupine`, `white` | Omarchy originals | MIT |

## Refreshing

Re-fetch the same paths from `omacom/omarchy` and update the commit SHA above:

```sh
SHA=$(curl -sL https://api.github.com/repos/omacom/omarchy/commits/quattro | jq -r .sha)
for theme in catppuccin-latte flexoki-light rose-pine lupine white \
             tokyo-night catppuccin nord gruvbox everforest; do
  curl -sLo "$theme/colors.toml" \
    "https://raw.githubusercontent.com/omacom/omarchy/$SHA/themes/$theme/colors.toml"
done
curl -sLo LICENSE "https://raw.githubusercontent.com/omacom/omarchy/$SHA/LICENSE"
```

The derivation in the build reads only these files, so a refresh is the whole update.
