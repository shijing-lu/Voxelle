# Third party notices

The Windows installer includes two FFmpeg project executables. They are separate programs invoked by this app.

- `ffmpeg.exe`: version 6.1.1, Gyan.dev essentials build. The bundled binary reports GPL version 3. Its build README, complete license text, and source commit link are included under `resources/licenses/` in the installation.
- `ffprobe.exe`: version 4.0.2, distributed through `ffprobe-static`, from a Zeranoe Windows static build. The binary reports GPL version 3. Source release: https://github.com/FFmpeg/FFmpeg/releases/tag/n4.0.2 . The same GPL version 3 text is included under `resources/licenses/`.

FFmpeg source and build information: https://ffmpeg.org/download.html . The npm wrappers `ffmpeg-static` and `ffprobe-static` have their own package licenses under `node_modules` in the application's ASAR archive.

If you redistribute a modified installation or the bundled binaries, review and meet the applicable GPL requirements, including corresponding source availability and notices.
