# Third party notices

The Windows installer includes two FFmpeg project executables. They are separate programs invoked by this app.

- `ffmpeg.exe`: version 6.1.1, Gyan.dev essentials build. The bundled binary reports GPL version 3. Its build README, complete license text, and source commit link are included under `resources/licenses/` in the installation.
- `ffprobe.exe`: version 4.0.2, distributed through `ffprobe-static`, from a Zeranoe Windows static build. The binary reports GPL version 3. Source release: https://github.com/FFmpeg/FFmpeg/releases/tag/n4.0.2 . The same GPL version 3 text is included under `resources/licenses/`.

FFmpeg source and build information: https://ffmpeg.org/download.html . The npm wrappers `ffmpeg-static` and `ffprobe-static` have their own package licenses under `node_modules` in the application's ASAR archive.

If you redistribute a modified installation or the bundled binaries, review and meet the applicable GPL requirements, including corresponding source availability and notices.

The installer also includes `yt-dlp.exe` version 2026.08.19, downloaded from the [official yt-dlp release](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19) and SHA-256 verified during packaging. yt-dlp and its bundled dependencies carry their own licenses; consult the upstream [license and third-party notices](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE) when redistributing.

The installer includes Deno 2.9.7 as the JavaScript runtime required by yt-dlp's YouTube extraction. Its official ZIP is SHA-256 verified during packaging. Deno is distributed under the MIT license with third-party dependency notices; consult the [Deno repository](https://github.com/denoland/deno) for redistribution requirements.
