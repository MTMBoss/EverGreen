const path = require("path");
const express = require("express");
const { createWebRouter } = require("./routes");

let started = false;

function startAttendanceWebServer(client) {
    if (started) return;
    started = true;

    const app = express();
    const port = Number(process.env.WEB_PORT || 3000);

    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "views"));

    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParserMiddleware);
    app.use(createWebRouter(client));

    app.listen(port, () => {
        console.log(`✅ Pannello web presenze avviato su http://localhost:${port}`);
    });
}

function cookieParserMiddleware(req, _res, next) {
    const raw = req.headers.cookie || "";
    const cookies = {};

    for (const part of raw.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (!key) continue;
        cookies[key] = decodeURIComponent(rest.join("="));
    }

    req.cookies = cookies;
    next();
}

module.exports = {
    startAttendanceWebServer,
};
