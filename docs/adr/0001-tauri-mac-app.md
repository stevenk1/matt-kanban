# The Board is a Tauri Mac app

The Board is a native macOS app built with Tauri: a Vite + React (TypeScript) UI, reading the Projects' `.scratch/` folders and calling `gh` through Tauri's fs and shell plugins. A Mac app was wanted over a localhost web page; Tauri gives a small real `.app` while keeping the TypeScript/React UI, so the UI designs can be prototyped in a plain browser and dropped in unchanged.

## Considered Options

- **Electron**: the planned Node logic would port as-is, but the app is ~15x larger and heavier at rest for a tool that sits open all day.
- **SwiftUI**: the most Mac-like, but means rewriting everything in Swift and prototyping the designs as SwiftUI mockups instead of switchable web variants.
