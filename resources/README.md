# Resources

This folder contains application resources:

## Required Files

Before building, add the following files:

1. **icon.ico** - Main application icon (256x256, Windows ICO format)
2. **tray-icon.png** - System tray icon (32x32 or 64x64, PNG format)

## Optional: Bundled Node.js

For a truly standalone installer that doesn't require Node.js to be installed:

1. Download Node.js portable from https://nodejs.org/en/download/
2. Extract to `node-portable/` subfolder
3. Should contain `node.exe` and `npm.cmd`

Structure:
```
resources/
├── icon.ico
├── tray-icon.png
└── node-portable/
    ├── node.exe
    ├── npm.cmd
    └── node_modules/
```

## Icon Generation

You can generate icons from a PNG using tools like:
- https://icoconvert.com/
- ImageMagick: `convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`

## Placeholder

Until you add real icons, the app will work but may show default icons.
