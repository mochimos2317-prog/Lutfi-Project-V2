// Vercel WebDeploy API for Lutfi Project V1.
// Keep VERCEL_TOKEN server-side as an Environment Variable.
// This endpoint deploys one HTML file as a Vercel project deployment.

const crypto = require("crypto");

function cleanName(value) {
  return String(value || "lutfi-project-v1")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "lutfi-project-v1";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: "VERCEL_TOKEN belum dipasang di Environment Variables Vercel."
    });
  }

  const html = typeof req.body === "string"
    ? req.body
    : Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : "";

  if (!html || !/<html[\s>]/i.test(html)) {
    return res.status(400).json({ error: "Body harus berupa file HTML." });
  }

  // Vercel Functions have request-size limits. This avoids pretending
  // oversized uploads will work through this endpoint.
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > 4 * 1024 * 1024) {
    return res.status(413).json({
      error: "File terlalu besar untuk WebDeploy langsung. Gunakan file di bawah 4 MB atau deploy melalui Git/CLI."
    });
  }

  const fileBuffer = Buffer.from(html, "utf8");
  const sha = crypto.createHash("sha1").update(fileBuffer).digest("hex");
  const projectName = cleanName(req.headers["x-project-name"]);

  // 1) Upload source file to Vercel.
  const upload = await fetch("https://api.vercel.com/v2/now/files", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "text/html",
      "x-vercel-digest": sha,
      "Content-Length": String(fileBuffer.length)
    },
    body: fileBuffer
  });

  if (!upload.ok) {
    const msg = await upload.text();
    return res.status(502).json({
      error: "Upload file ke Vercel gagal.",
      detail: msg.slice(0, 500)
    });
  }

  // 2) Create the deployment.
  const deployment = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: projectName,
      target: "production",
      files: [
        {
          file: "index.html",
          sha,
          size: fileBuffer.length
        }
      ],
      projectSettings: {
        framework: null
      }
    })
  });

  const data = await deployment.json().catch(() => ({}));
  if (!deployment.ok) {
    return res.status(502).json({
      error: "Vercel gagal membuat deployment.",
      detail: data
    });
  }

  const deploymentUrl = data.url
    ? `https://${data.url}`
    : null;

  return res.status(200).json({
    ok: true,
    id: data.id || data.uid,
    url: deploymentUrl,
    state: data.readyState || data.state || "QUEUED"
  });
};
