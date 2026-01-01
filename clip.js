import readline from "readline";
import { spawn, exec } from "child_process";
import fs from "fs";

// =======================
// SETUP CLI
// =======================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(q) {
  return new Promise((res) => rl.question(q, res));
}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

// =======================
// VALIDASI WAKTU mm:ss
// =======================
function isValidTimeFormat(input) {
  return /^\d{2}:\d{2}$/.test(input);
}

async function askTime(label) {
  while (true) {
    const input = (await ask(`⏱️ ${label} (mm:ss): `)).trim();

    if (!/^[0-9:]+$/.test(input)) {
      console.log('⚠️ Hanya angka dan ":"');
      continue;
    }

    if (!isValidTimeFormat(input)) {
      console.log("⚠️ Format harus mm:ss (contoh 02:59)");
      continue;
    }

    return input;
  }
}

function timeToSeconds(t) {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
}

// =======================
// OUTPUT NAME GENERATOR
// =======================
function getAutoClipName() {
  const today = new Date();
  const date =
    String(today.getDate()).padStart(2, "0") +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    today.getFullYear();

  const files = fs.readdirSync("output");
  const clips = files.filter((f) =>
    f.match(new RegExp(`^clip\\d+-${date}\\.mp4$`))
  );

  return `clip${clips.length + 1}-${date}.mp4`;
}

// =======================
// YOUTUBE UTIL
// =======================
function getYoutubeTitle(url) {
  return new Promise((resolve) => {
    exec(`yt-dlp --get-title "${url}"`, (err, stdout) => {
      if (err) resolve("video-youtube");
      else resolve(stdout.trim().replace(/[^\w\s-]/g, ""));
    });
  });
}

function downloadWithProgress(url, filename) {
  return new Promise((resolve, reject) => {
    const yt = spawn("yt-dlp", [
      "-f",
      "mp4",
      "-o",
      `temp/${filename}.mp4`,
      "--newline",
      url,
    ]);

    yt.stdout.on("data", (data) => {
      const text = data.toString();
      const match = text.match(/(\d+\.\d+)%/);
      if (match) {
        process.stdout.write(`\r⬇️ Downloading... ${match[1]}%`);
      }
    });

    yt.on("close", (code) => {
      if (code === 0) {
        process.stdout.write("\r⬇️ Downloading... 100%\n");
        console.log("✔ Download selesai\n");
        resolve();
      } else {
        reject(new Error("Gagal download video"));
      }
    });
  });
}

// =======================
// MAIN
// =======================
(async () => {
  try {
    if (!fs.existsSync("temp")) fs.mkdirSync("temp");
    if (!fs.existsSync("output")) fs.mkdirSync("output");

    console.log("\n🎬 YT CLIPPER CLI\n");
    console.log("1. YouTube");
    console.log("2. Video lokal (folder temp)");

    const source = await ask("Pilih (1/2): ");

    let videoPath = "";
    let videoName = "";

    // ===== YOUTUBE =====
    if (source === "1") {
      const url = await ask("\n🔗 Link YouTube: ");
      const title = await getYoutubeTitle(url);

      console.log(`📌 Judul terdeteksi: ${title}`);
      const custom = await ask(
        "✏️ Gunakan judul ini? (enter = ya / ketik nama lain): "
      );

      videoName = (custom || title).trim().replace(/[^a-zA-Z0-9-_]/g, "_");

      await downloadWithProgress(url, videoName);
      videoPath = `temp/${videoName}.mp4`;
    }

    // ===== LOCAL =====
    else if (source === "2") {
      const files = fs.readdirSync("temp").filter((f) => f.endsWith(".mp4"));

      if (!files.length) {
        console.log("❌ Folder temp kosong");
        process.exit();
      }

      console.log("\n📁 Video tersedia:");
      files.forEach((f, i) => console.log(`${i + 1}. ${f}`));

      const pick = await ask("Pilih nomor video: ");
      if (!files[pick - 1]) {
        console.log("❌ Pilihan tidak valid");
        process.exit();
      }

      videoName = files[pick - 1].replace(".mp4", "");
      videoPath = `temp/${files[pick - 1]}`;
    } else {
      console.log("❌ Pilihan tidak valid");
      process.exit();
    }

    // ===== CUT =====
    const start = await askTime("Mulai");
    const end = await askTime("Sampai");

    if (timeToSeconds(end) <= timeToSeconds(start)) {
      console.log("⚠️ Waktu akhir harus lebih besar");
      process.exit();
    }

    // ===== OUTPUT NAME =====
    const outputInput = await ask("\n💾 Nama file output (enter = otomatis): ");

    let outputName = outputInput.trim();
    if (!outputName) {
      outputName = getAutoClipName();
    } else if (!outputName.endsWith(".mp4")) {
      outputName += ".mp4";
    }

    console.log("\n✂️ Cutting video...");

    await execPromise(
      `ffmpeg -y -i "${videoPath}" -ss 00:${start} -to 00:${end} \
-c copy -avoid_negative_ts make_zero "output/${outputName}"`
    );

    console.log(`✔ Cutting selesai → output/${outputName}`);

    // ===== TEMP =====
    const del = await ask("\n🧹 Hapus video temp? (y/n): ");
    if (del.toLowerCase() === "y") {
      fs.unlinkSync(videoPath);
      console.log("🗑️ Video temp dihapus");
    } else {
      console.log("📦 Video temp disimpan");
    }

    console.log("\n✅ DONE!");
    rl.close();
  } catch (e) {
    console.error("\n❌ ERROR:", e.message);
    rl.close();
  }
})();
