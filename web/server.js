const path = require("path");
const express = require("express");
const { createWebRouter } = require("./routes");

let started = false;

function startAttendanceWebServer(client) {
    if (started) return;
    started = true;

    const app = express();
    const port = Number(process.env.PORT || process.env.WEB_PORT || 3000);
    const host = "0.0.0.0";

    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "views"));

    app.use(express.urlencoded({ extended: true }));
    app.use("/assets", express.static(path.join(__dirname, "public")));
    app.use(cookieParserMiddleware);
    app.use(createWebRouter(client));

    app.get("/health", (_req, res) => {
        res.status(200).send("ok");
    });

    app.listen(port, host, () => {
        console.log(`✅ Pannello web presenze avviato su http://${host}:${port}`);
    });
}

function cookieParserMiddleware(req, res, next) {
    const raw = req.headers.cookie || "";
    const cookies = {};

    for (const part of raw.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (!key) continue;
        cookies[key] = decodeURIComponent(rest.join("="));
    }

    req.cookies = cookies;

    res.cookie = (name, value, options = {}) => {
        const parts = [`${name}=${encodeURIComponent(value)}`];

        if (options.httpOnly) parts.push("HttpOnly");
        if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
        if (typeof options.maxAge === "number") parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
        if (options.path) parts.push(`Path=${options.path}`);
        else parts.push("Path=/");

        res.append("Set-Cookie", parts.join("; "));
    };

    res.clearCookie = (name, options = {}) => {
        const parts = [
            `${name}=`,
            "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
            `Path=${options.path || "/"}`,
        ];
        res.append("Set-Cookie", parts.join("; "));
    };

    next();
}

module.exports = {
    startAttendanceWebServer,
};
