import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kitemmodels as KItemModels
import org.kde.ksysguard.sensors as Sensors
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as Plasma5Support
import org.kde.plasma.plasmoid

PlasmoidItem {
    // detect style switches
    // pool full — silently drop
    // min 10 fps when CPU is stressed
    // min 15 fps

    id: root

    // ── raw state (from sensors) ──
    property real rawCpuLoad: 0
    property real rawCpuTemp: NaN
    // ── smoothed state (lerped each frame) ──
    property real cpuLoad: 0
    property real cpuTemp: NaN
    property real animTime: 0
    // ── config ──
    readonly property int lowTemp: plasmoid.configuration.lowTemp
    readonly property int highTemp: plasmoid.configuration.highTemp
    readonly property int updateInterval: Math.max(500, plasmoid.configuration.updateInterval || 2000)
    readonly property string tempSensorPath: plasmoid.configuration.tempSensorPath
    readonly property int flameStyle: plasmoid.configuration.flameStyle
    readonly property int renderBackend: plasmoid.configuration.renderBackend || 0 // 0=shader, 1=legacy canvas
    readonly property bool showLoadText: plasmoid.configuration.showLoadText
    readonly property bool showTempText: plasmoid.configuration.showTempText
    readonly property int maxTextSize: plasmoid.configuration.maxTextSize || 24
    readonly property bool transparentBg: plasmoid.configuration.transparentBackground
    readonly property int widgetFps: Math.max(5, Math.min(60, plasmoid.configuration.widgetFps || 15))
    readonly property int batteryFps: Math.max(1, Math.min(15, plasmoid.configuration.batteryFps || 5))
    readonly property real particleSize: (plasmoid.configuration.particleSize || 10) / 10
    readonly property int cfgParticleCount: plasmoid.configuration.particleCount || 60
    readonly property int panelWidth: plasmoid.configuration.panelWidth || 80
    readonly property bool isPanel: plasmoid.formFactor === PlasmaCore.Types.Horizontal || plasmoid.formFactor === PlasmaCore.Types.Vertical
    readonly property bool isDesktop: plasmoid.formFactor === PlasmaCore.Types.Planar
    readonly property int overlayTextNeededWidth: (showLoadText || showTempText) ? Math.ceil(overlayTextMetrics.advanceWidth) + 8 : 0
    // ═══════════════════════════════════════
    // PERFORMANCE CONTROLS
    // ═══════════════════════════════════════
    property bool painting: false
    // guard against overlapping paints
    property int frameInterval: Math.max(1, Math.round(1000 / widgetFps))
    // ms between frames
    property int lastStyleIndex: -1
    property bool onBattery: false
    // ═══════════════════════════════════════
    // Sensor selection
    // ═══════════════════════════════════════
    property string detectedTempSensorId: ""
    property string detectedSensorPath: ""
    readonly property bool useTempPathFallback: detectedSensorPath.length > 0
    // ═══════════════════════════════════════
    // Particle pool — fixed-size array, no allocations during render
    // ═══════════════════════════════════════
    property int maxParticles: cfgParticleCount
    property var particles: []
    property int particleCount: 0 // active count for quick iteration
    // pre-compute colors once per frame, not per pixel
    property var frameColors: ({
        "base": {
            "r": 0,
            "g": 0.5,
            "b": 1
        },
        "bright": {
            "r": 0.5,
            "g": 0.8,
            "b": 1
        },
        "glow": {
            "r": 0,
            "g": 0.1,
            "b": 0.3
        }
    })
    // pre-baked rgba strings updated once per frame
    property string baseRgba: ""
    property string brightRgba: ""
    property var alphaStringCache: []
    property int noiseCacheSize: 64
    property var noiseCache: []
    property bool classicShaderReady: false
    property bool classicShaderFailed: false
    property string classicShaderLog: ""
    property bool emberShaderReady: false
    property bool emberShaderFailed: false
    property string emberShaderLog: ""
    property bool plasmaShaderReady: false
    property bool plasmaShaderFailed: false
    property string plasmaShaderLog: ""
    readonly property bool classicShaderCompiled: classicShader.status === ShaderEffect.Compiled && !classicShaderFailed
    readonly property bool emberShaderCompiled: emberShader.status === ShaderEffect.Compiled && !emberShaderFailed
    readonly property bool plasmaShaderCompiled: plasmaShader.status === ShaderEffect.Compiled && !plasmaShaderFailed
    readonly property bool styleShaderCompiled: flameStyle === 0 ? classicShaderCompiled : (flameStyle === 1 ? emberShaderCompiled : plasmaShaderCompiled)
    readonly property bool useShaderRenderer: renderBackend === 0 && styleShaderCompiled
    readonly property bool useCanvasRenderer: renderBackend === 1
    readonly property string tooltipLoadText: isNaN(cpuLoad) ? "--" : (Math.round(cpuLoad * 100) + "%")
    readonly property string tooltipTempText: isNaN(cpuTemp) ? "--" : (Math.round(cpuTemp) + "°C")
    readonly property string localeName: (Qt.locale().name || "en_US").toLowerCase()
    readonly property var tooltipTranslations: ({
        "zh_CN": {
            "Load": "负载",
            "Temp": "温度"
        },
        "es": {
            "Load": "Carga",
            "Temp": "Temp."
        },
        "fr": {
            "Load": "Charge",
            "Temp": "Temp."
        },
        "hi": {
            "Load": "लोड",
            "Temp": "ताप"
        },
        "pt": {
            "Load": "Carga",
            "Temp": "Temp."
        },
        "uk": {
            "Load": "Навантаження",
            "Temp": "Темп."
        }
    })
    readonly property string overlayText: {
        var parts = [];
        if (showLoadText)
            parts.push(Math.round(cpuLoad * 100) + "%");

        if (showTempText)
            parts.push(isNaN(cpuTemp) ? "--\u00B0" : (Math.round(cpuTemp) + "\u00B0"));

        return parts.join(" ");
    }
    readonly property color themeTextColor: Kirigami.Theme.textColor
    readonly property color themeBackgroundColor: Kirigami.Theme.backgroundColor
    readonly property string themeFontFamily: Kirigami.Theme.defaultFont.family
    readonly property bool themeFontBold: Kirigami.Theme.defaultFont.bold

    function langCode() {
        if (localeName.indexOf("zh") === 0)
            return "zh_CN";

        if (localeName.indexOf("pt_br") === 0)
            return "pt_BR";

        return localeName.split("_")[0];
    }

    function tooltipLabel(key) {
        var lang = langCode();
        var table = tooltipTranslations[lang];
        if (!table && lang === "pt_BR")
            table = tooltipTranslations.pt;

        return table && table[key] ? table[key] : key;
    }

    // Adaptive FPS: when CPU is loaded, slow down animation to not add to the problem
    function updateFrameRate() {
        var targetFps = onBattery ? batteryFps : widgetFps;
        var baseInterval = Math.max(1, Math.round(1000 / targetFps));
        if (cpuLoad > 0.8)
            frameInterval = Math.max(baseInterval, 100);
        else if (cpuLoad > 0.5)
            frameInterval = Math.max(baseInterval, 66);
        else
            frameInterval = baseInterval;
        animTimer.interval = frameInterval;
    }

    function parsePowerState(output) {
        var v = parseInt(output.trim());
        if (isNaN(v))
            return ;

        if (v === 1) {
            if (!onBattery) {
                onBattery = true;
                updateFrameRate();
            }
        } else if (v === 0) {
            if (onBattery) {
                onBattery = false;
                updateFrameRate();
            }
        }
    }

    function pollPowerState() {
        var cmd = "if [ -d /sys/class/power_supply ]; then " + "for f in /sys/class/power_supply/*/type; do " + "t=$(cat \"$f\" 2>/dev/null); " + "case \"$t\" in Mains|USB|USB_C|USB_PD) " + "o=\"$(dirname \"$f\")/online\"; " + "if [ -f \"$o\" ] && [ \"$(cat \"$o\" 2>/dev/null)\" = \"1\" ]; then echo 0; exit 0; fi;; " + "esac; done; " + "for f in /sys/class/power_supply/*/status; do " + "s=$(cat \"$f\" 2>/dev/null); " + "case \"$s\" in Discharging) echo 1; exit 0;; Charging|Full|Not\\ charging) echo 0; exit 0;; esac; " + "done; fi; echo -1";
        powerSource.connectSource(cmd);
    }

    function parseSensorNumber(value) {
        if (typeof value === "number")
            return value;

        if (typeof value === "string")
            return parseFloat(value.trim());

        return NaN;
    }

    function updateCpuLoadFromSensor(value) {
        var v = parseSensorNumber(value);
        if (isNaN(v))
            return ;

        if (v > 1)
            v /= 100;

        rawCpuLoad = Math.max(0, Math.min(1, v));
        updateFrameRate();
    }

    function updateCpuTempFromSensor(value) {
        var v = parseSensorNumber(value);
        if (isNaN(v))
            return ;

        if (v > 1000)
            v /= 1000;

        rawCpuTemp = v;
    }

    function parseCpuTempFile(output) {
        updateCpuTempFromSensor(output);
    }

    function isLikelyCpuTempSensorId(sensorId) {
        var s = String(sensorId || "").toLowerCase();
        if (s.length === 0)
            return false;

        var isTemp = s.indexOf("temperature") !== -1 || s.indexOf("/temp") !== -1 || s.indexOf("tdie") !== -1 || s.indexOf("tctl") !== -1;
        if (!isTemp)
            return false;

        return s.indexOf("cpu") !== -1 || s.indexOf("coretemp") !== -1 || s.indexOf("k10temp") !== -1 || s.indexOf("zenpower") !== -1 || s.indexOf("package") !== -1;
    }

    function detectNativeTempSensor() {
        if (useTempPathFallback)
            return ;

        var rows = sensorListModel.rowCount();
        var firstAnyTemp = "";
        for (var i = 0; i < rows; i++) {
            var idx = sensorListModel.index(i, 0);
            var sensorId = String(sensorListModel.data(idx, Sensors.SensorTreeModel.SensorId) || "");
            if (sensorId.length === 0)
                continue;

            var lower = sensorId.toLowerCase();
            if (firstAnyTemp.length === 0 && (lower.indexOf("temperature") !== -1 || lower.indexOf("/temp") !== -1))
                firstAnyTemp = sensorId;

            if (isLikelyCpuTempSensorId(sensorId)) {
                detectedTempSensorId = sensorId;
                return ;
            }
        }
        if (firstAnyTemp.length > 0)
            detectedTempSensorId = firstAnyTemp;
        else
            detectedTempSensorId = "";
    }

    function refreshTempSource() {
        detectedSensorPath = "";
        detectedTempSensorId = "";
        if (tempSensorPath && tempSensorPath.length > 0) {
            var userPath = sanitizeSensorPath(tempSensorPath);
            if (userPath.length > 0)
                detectedSensorPath = userPath;
            else
                console.warn("CPU Flame: Ignoring invalid sensor path from settings.");
            return ;
        }
        detectNativeTempSensor();
    }

    function clearParticles() {
        for (var i = 0; i < particles.length; i++) particles[i].alive = false
        particleCount = 0;
    }

    function spawnParticle(x, y, vx, vy, life, size, ptype) {
        var pool = particles;
        for (var i = 0; i < pool.length; i++) {
            if (!pool[i].alive) {
                var p = pool[i];
                p.alive = true;
                p.x = x;
                p.y = y;
                p.vx = vx;
                p.vy = vy;
                p.life = life;
                p.maxLife = life;
                p.size = size;
                p.ptype = ptype || 0;
                particleCount++;
                return ;
            }
        }
    }

    function updateParticles(dt) {
        var pool = particles;
        var count = 0;
        for (var i = 0; i < pool.length; i++) {
            var p = pool[i];
            if (!p.alive)
                continue;

            p.x += p.vx * dt;
            p.y += p.vy * dt;
            // gentle drift — cheaper than noise per particle
            p.vx += (((p.x * 12.9898 + animTime * 78.233) % 6.2832) > 3.1416 ? 1 : -1) * dt * 6;
            p.life -= dt;
            if (p.life <= 0)
                p.alive = false;
            else
                count++;
        }
        particleCount = count;
    }

    // ═══════════════════════════════════════
    // Noise — same as before but cached-friendly
    // ═══════════════════════════════════════
    function noise(x, y) {
        var n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5;
        return n - Math.floor(n);
    }

    function buildAlphaCache() {
        var arr = [];
        for (var i = 0; i <= 100; i++) arr.push((i / 100).toFixed(2))
        alphaStringCache = arr;
    }

    function alphaStr(a) {
        var idx = Math.round(Math.max(0, Math.min(1, a)) * 100);
        return alphaStringCache[idx];
    }

    function initNoiseCache() {
        var n = Math.max(16, noiseCacheSize);
        var arr = new Array(n * n);
        for (var y = 0; y < n; y++) {
            for (var x = 0; x < n; x++) {
                arr[y * n + x] = noise(x * 0.173, y * 0.197);
            }
        }
        noiseCache = arr;
    }

    function cachedNoise(ix, iy) {
        var n = noiseCacheSize;
        var x = ((ix % n) + n) % n;
        var y = ((iy % n) + n) % n;
        return noiseCache[y * n + x];
    }

    function smoothNoiseCached(x, y) {
        var ix = Math.floor(x), iy = Math.floor(y);
        var fx = x - ix, fy = y - iy;
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        var a = cachedNoise(ix, iy), b = cachedNoise(ix + 1, iy), c = cachedNoise(ix, iy + 1), d = cachedNoise(ix + 1, iy + 1);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }

    function fbm3Cached(x, y) {
        return 0.5 * smoothNoiseCached(x, y) + 0.25 * smoothNoiseCached(x * 2, y * 2) + 0.125 * smoothNoiseCached(x * 4, y * 4);
    }

    function smoothNoise(x, y) {
        var ix = Math.floor(x), iy = Math.floor(y);
        var fx = x - ix, fy = y - iy;
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        var a = noise(ix, iy), b = noise(ix + 1, iy), c = noise(ix, iy + 1), d = noise(ix + 1, iy + 1);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }

    function fbm3(x, y) {
        // 3 octaves instead of 4-5 — visually near identical, much cheaper
        return 0.5 * smoothNoise(x, y) + 0.25 * smoothNoise(x * 2, y * 2) + 0.125 * smoothNoise(x * 4, y * 4);
    }

    function sanitizeSensorPath(path) {
        var p = (path || "").trim();
        if (p.length === 0)
            return "";

        if (p.indexOf("/sys/") !== 0)
            return "";

        if (!/^\/sys\/[A-Za-z0-9_\-./]+$/.test(p))
            return "";

        return p;
    }

    function shellQuote(value) {
        return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
    }

    // ═══════════════════════════════════════
    // Color helpers
    // ═══════════════════════════════════════
    function tempNorm(temp) {
        if (isNaN(temp))
            return 0;

        return Math.max(0, Math.min(1, (temp - lowTemp) / Math.max(1, highTemp - lowTemp)));
    }

    function computeColors(temp) {
        var t = tempNorm(temp);
        var br, bg, bb, cr, cg, cb, gr, gg, gb;
        if (t < 0.25) {
            var s = t / 0.25;
            br = 0.04;
            bg = 0.15 + 0.55 * s;
            bb = 0.7 + 0.3 * s;
        } else if (t < 0.5) {
            var s = (t - 0.25) / 0.25;
            br = 0.04 + 0.96 * s;
            bg = 0.7 + 0.3 * s;
            bb = 1 - 0.85 * s;
        } else if (t < 0.75) {
            var s = (t - 0.5) / 0.25;
            br = 1;
            bg = 1 - 0.45 * s;
            bb = 0.15 - 0.1 * s;
        } else {
            var s = (t - 0.75) / 0.25;
            br = 1;
            bg = 0.55 - 0.55 * s;
            bb = 0.05;
        }
        if (t < 0.25) {
            var s = t / 0.25;
            cr = 0.4;
            cg = 0.6 + 0.3 * s;
            cb = 1;
        } else if (t < 0.5) {
            var s = (t - 0.25) / 0.25;
            cr = 0.4 + 0.6 * s;
            cg = 0.9 + 0.1 * s;
            cb = 1 - 0.65 * s;
        } else if (t < 0.75) {
            var s = (t - 0.5) / 0.25;
            cr = 1;
            cg = 1 - 0.15 * s;
            cb = 0.35 - 0.15 * s;
        } else {
            var s = (t - 0.75) / 0.25;
            cr = 1;
            cg = 0.85 - 0.45 * s;
            cb = 0.2 + 0.15 * s;
        }
        if (t < 0.5) {
            gr = 0.02 + t * 0.1;
            gg = 0.05 + t * 0.3;
            gb = 0.2 + t * 0.3;
        } else {
            gr = 0.15 + (t - 0.5) * 1.5;
            gg = 0.2 - (t - 0.5) * 0.25;
            gb = 0.35 - (t - 0.5) * 0.5;
        }
        frameColors = {
            "base": {
                "r": br,
                "g": bg,
                "b": bb
            },
            "bright": {
                "r": cr,
                "g": cg,
                "b": cb
            },
            "glow": {
                "r": gr,
                "g": gg,
                "b": gb
            }
        };
    }

    function rgba(c, a) {
        return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + alphaStr(a) + ")";
    }

    function rgbaColor(c, aOverride) {
        var a = (aOverride === undefined || aOverride === null) ? c.a : aOverride;
        return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + alphaStr(a) + ")";
    }

    function lerpC(a, b, t) {
        return {
            "r": a.r + (b.r - a.r) * t,
            "g": a.g + (b.g - a.g) * t,
            "b": a.b + (b.b - a.b) * t
        };
    }

    function bakeColorStrings() {
        var c = frameColors;
        baseRgba = Math.round(c.base.r * 255) + "," + Math.round(c.base.g * 255) + "," + Math.round(c.base.b * 255);
        brightRgba = Math.round(c.bright.r * 255) + "," + Math.round(c.bright.g * 255) + "," + Math.round(c.bright.b * 255);
    }

    // ── sizing ──
    preferredRepresentation: fullRepresentation
    implicitWidth: isPanel ? Math.max(panelWidth, overlayTextNeededWidth) : 256
    implicitHeight: isPanel ? 120 : 256
    Layout.preferredWidth: implicitWidth
    Layout.preferredHeight: implicitHeight
    Layout.minimumWidth: 32
    Layout.minimumHeight: 32
    Plasmoid.icon: "utilities-system-monitor"
    Plasmoid.backgroundHints: transparentBg ? PlasmaCore.Types.NoBackground : PlasmaCore.Types.DefaultBackground
    onTempSensorPathChanged: refreshTempSource()
    Component.onCompleted: {
        refreshTempSource();
        buildAlphaCache();
        initNoiseCache();
        var pool = [];
        var count = Math.min(200, cfgParticleCount); // hard cap at 200
        for (var i = 0; i < count; i++) {
            pool.push({
                "alive": false,
                "x": 0,
                "y": 0,
                "vx": 0,
                "vy": 0,
                "life": 0,
                "maxLife": 1,
                "size": 1,
                "ptype": 0
            });
        }
        particles = pool;
    }

    PlasmaCore.ToolTipArea {
        anchors.fill: parent
        active: true
        subText: root.tooltipLabel("Load") + ": " + root.tooltipLoadText + "  " + root.tooltipLabel("Temp") + ": " + root.tooltipTempText
    }

    Sensors.SensorTreeModel {
        id: sensorTreeModel
    }

    KItemModels.KDescendantsProxyModel {
        id: sensorListModel

        model: sensorTreeModel
        onModelReset: root.detectNativeTempSensor()
        onRowsInserted: root.detectNativeTempSensor()
    }

    Sensors.Sensor {
        id: cpuUsageSensor

        sensorId: "cpu/all/usage"
        updateRateLimit: root.updateInterval
        enabled: true
        onValueChanged: root.updateCpuLoadFromSensor(value)
    }

    Sensors.Sensor {
        id: nativeTempSensor

        sensorId: root.detectedTempSensorId
        updateRateLimit: root.updateInterval
        enabled: !root.useTempPathFallback && root.detectedTempSensorId.length > 0
        onValueChanged: root.updateCpuTempFromSensor(value)
    }

    Plasma5Support.DataSource {
        id: tempFileSource

        engine: "executable"
        connectedSources: []
        onNewData: function(source, data) {
            var stdout = data["stdout"];
            root.parseCpuTempFile(stdout);
            disconnectSource(source);
        }
    }

    Plasma5Support.DataSource {
        id: powerSource

        engine: "executable"
        connectedSources: []
        onNewData: function(source, data) {
            var stdout = data["stdout"];
            root.parsePowerState(stdout);
            disconnectSource(source);
        }
    }

    Timer {
        id: pollTimer

        interval: root.updateInterval
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            if (root.useTempPathFallback)
                tempFileSource.connectSource("cat -- " + root.shellQuote(root.detectedSensorPath));

            root.pollPowerState();
        }
    }

    // ═══════════════════════════════════════
    // Animation timer — adaptive FPS
    // ═══════════════════════════════════════
    Timer {
        id: animTimer

        interval: root.frameInterval
        running: true
        repeat: true
        onTriggered: {
            var usingCanvas = root.useCanvasRenderer;
            // skip if previous paint is still running
            if (usingCanvas && root.painting)
                return ;

            var dt = interval / 1000;
            root.animTime += dt;
            // smooth interpolation
            var lerpRate = Math.min(1, dt * 3);
            root.cpuLoad += (root.rawCpuLoad - root.cpuLoad) * lerpRate;
            if (!isNaN(root.rawCpuTemp)) {
                if (isNaN(root.cpuTemp))
                    root.cpuTemp = root.rawCpuTemp;
                else
                    root.cpuTemp += (root.rawCpuTemp - root.cpuTemp) * lerpRate;
            }
            // detect style switch → clear particles
            if (root.flameStyle !== root.lastStyleIndex) {
                root.clearParticles();
                root.lastStyleIndex = root.flameStyle;
            }
            root.computeColors(root.cpuTemp);
            root.bakeColorStrings();
            if (usingCanvas) {
                root.updateParticles(dt);
                root.painting = true;
                flameCanvas.requestPaint();
            } else if (root.particleCount > 0) {
                root.clearParticles();
            }
        }
    }

    ShaderEffect {
        id: classicShader

        property real u_time: root.animTime
        property real u_load: root.cpuLoad
        property real u_showGlow: root.transparentBg ? 0 : 1
        property vector2d u_resolution: Qt.vector2d(Math.max(1, width), Math.max(1, height))
        property vector4d u_baseColor: Qt.vector4d(root.frameColors.base.r, root.frameColors.base.g, root.frameColors.base.b, 1)
        property vector4d u_brightColor: Qt.vector4d(root.frameColors.bright.r, root.frameColors.bright.g, root.frameColors.bright.b, 1)
        property vector4d u_glowColor: Qt.vector4d(root.frameColors.glow.r, root.frameColors.glow.g, root.frameColors.glow.b, 1)

        anchors.fill: parent
        z: 0
        visible: root.renderBackend === 0 && root.flameStyle === 0 && !root.classicShaderFailed
        blending: true
        fragmentShader: Qt.resolvedUrl("shaders/classic.frag.qsb")
        onStatusChanged: {
            if (status === ShaderEffect.Compiled) {
                root.classicShaderReady = true;
                root.classicShaderFailed = false;
            } else if (status === ShaderEffect.Error) {
                root.classicShaderFailed = true;
                root.classicShaderReady = false;
                root.classicShaderLog = log;
                console.warn("CPU Flame: Classic shader failed. Effect area is blank in Shader mode. " + log);
            } else {
                root.classicShaderReady = false;
            }
        }
    }

    ShaderEffect {
        id: emberShader

        property real u_time: root.animTime
        property real u_load: root.cpuLoad
        property real u_showGlow: root.transparentBg ? 0 : 1
        property real u_particleSize: root.particleSize
        property real u_particleCount: Math.min(200, root.cfgParticleCount)
        property vector2d u_resolution: Qt.vector2d(Math.max(1, width), Math.max(1, height))
        property vector4d u_baseColor: Qt.vector4d(root.frameColors.base.r, root.frameColors.base.g, root.frameColors.base.b, 1)
        property vector4d u_brightColor: Qt.vector4d(root.frameColors.bright.r, root.frameColors.bright.g, root.frameColors.bright.b, 1)
        property vector4d u_glowColor: Qt.vector4d(root.frameColors.glow.r, root.frameColors.glow.g, root.frameColors.glow.b, 1)

        anchors.fill: parent
        z: 0
        visible: root.renderBackend === 0 && root.flameStyle === 1 && !root.emberShaderFailed
        blending: true
        fragmentShader: Qt.resolvedUrl("shaders/ember.frag.qsb")
        onStatusChanged: {
            if (status === ShaderEffect.Compiled) {
                root.emberShaderReady = true;
                root.emberShaderFailed = false;
            } else if (status === ShaderEffect.Error) {
                root.emberShaderFailed = true;
                root.emberShaderReady = false;
                root.emberShaderLog = log;
                console.warn("CPU Flame: Ember shader failed. Effect area is blank in Shader mode. " + log);
            } else {
                root.emberShaderReady = false;
            }
        }
    }

    ShaderEffect {
        id: plasmaShader

        property real u_time: root.animTime
        property real u_load: root.cpuLoad
        property real u_showGlow: root.transparentBg ? 0 : 1
        property real u_particleSize: root.particleSize
        property real u_particleCount: Math.min(200, root.cfgParticleCount)
        property vector2d u_resolution: Qt.vector2d(Math.max(1, width), Math.max(1, height))
        property vector4d u_baseColor: Qt.vector4d(root.frameColors.base.r, root.frameColors.base.g, root.frameColors.base.b, 1)
        property vector4d u_brightColor: Qt.vector4d(root.frameColors.bright.r, root.frameColors.bright.g, root.frameColors.bright.b, 1)
        property vector4d u_glowColor: Qt.vector4d(root.frameColors.glow.r, root.frameColors.glow.g, root.frameColors.glow.b, 1)

        anchors.fill: parent
        z: 0
        visible: root.renderBackend === 0 && root.flameStyle === 2 && !root.plasmaShaderFailed
        blending: true
        fragmentShader: Qt.resolvedUrl("shaders/plasma.frag.qsb")
        onStatusChanged: {
            if (status === ShaderEffect.Compiled) {
                root.plasmaShaderReady = true;
                root.plasmaShaderFailed = false;
            } else if (status === ShaderEffect.Error) {
                root.plasmaShaderFailed = true;
                root.plasmaShaderReady = false;
                root.plasmaShaderLog = log;
                console.warn("CPU Flame: Plasma shader failed. Effect area is blank in Shader mode. " + log);
            } else {
                root.plasmaShaderReady = false;
            }
        }
    }

    TextMetrics {
        id: overlayTextMetrics

        font.family: root.themeFontFamily
        font.bold: root.themeFontBold
        font.pixelSize: root.maxTextSize
        text: root.overlayText
    }

    Text {
        id: overlayTextItem

        z: 2
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: root.isPanel ? 2 : 4
        anchors.rightMargin: root.isPanel ? 2 : 4
        anchors.verticalCenter: parent.verticalCenter
        anchors.bottom: undefined
        anchors.bottomMargin: 0
        height: parent.height
        visible: (root.showLoadText || root.showTempText) && Math.min(root.width, root.height) > 14
        text: root.overlayText
        color: Qt.rgba(root.themeTextColor.r, root.themeTextColor.g, root.themeTextColor.b, Math.min(1, root.themeTextColor.a * 0.9))
        style: Text.Outline
        styleColor: Qt.rgba(root.themeBackgroundColor.r, root.themeBackgroundColor.g, root.themeBackgroundColor.b, 0.6)
        font.family: root.themeFontFamily
        font.bold: root.themeFontBold
        font.pixelSize: root.maxTextSize
        minimumPixelSize: root.isPanel ? 8 : 9
        fontSizeMode: Text.Fit
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        wrapMode: Text.NoWrap
    }

    // ═══════════════════════════════════════
    // Canvas
    // ═══════════════════════════════════════
    Canvas {
        id: flameCanvas

        // ───────────────────────────────────
        // STYLE 0: Classic — smooth gradient
        // Perf: coarser grid (cellSize 5-6px), 3-octave fbm
        // ───────────────────────────────────
        function drawClassic(ctx, w, h, dt, load, time, colors, flameH) {
            // soft glow (single gradient, cheap)
            if (!root.transparentBg) {
                var grd = ctx.createRadialGradient(w / 2, h, 0, w / 2, h - flameH * 0.4, w * 0.6);
                grd.addColorStop(0, root.rgba(colors.glow, 0.15 * load));
                grd.addColorStop(1, "transparent");
                ctx.fillStyle = grd;
                ctx.fillRect(0, 0, w, h);
            }
            // adaptive cell size — fewer cells = fewer draw calls
            var cellSize = Math.max(5, Math.round(Math.min(w, h) / 25));
            var cols = Math.ceil(w / cellSize);
            var rows = Math.ceil(flameH / cellSize);
            for (var iy = 0; iy < rows; iy++) {
                var yN = iy / Math.max(1, rows - 1);
                var yPx = h - yN * flameH;
                for (var ix = 0; ix < cols; ix++) {
                    var xN = ix / cols;
                    var xDist = Math.abs(xN - 0.5);
                    // envelope
                    var envW;
                    if (yN < 0.25) {
                        envW = 0.42 + 0.08 * (1 - yN / 0.25);
                    } else {
                        var q = (yN - 0.25) / 0.75;
                        envW = 0.42 * (1 - q) * (1 - 0.5 * q);
                    }
                    envW *= (0.45 + 0.55 * load);
                    if (xDist > envW)
                        continue;

                    // 3-octave noise (was 5)
                    var turb = root.fbm3Cached(xN * 3 + time * 0.15, yN * 5 - time * 0.8);
                    var wobble = (turb - 0.5) * 0.07 * (1 + yN);
                    var effEnv = envW + wobble;
                    if (xDist > effEnv)
                        continue;

                    var edgeT = 1 - xDist / Math.max(0.001, effEnv);
                    var intensity = Math.min(1, edgeT * 2.5);
                    intensity *= intensity; // pow2 falloff
                    intensity *= (1 - yN * yN); // tip fade
                    intensity *= (0.65 + 0.35 * turb);
                    if (intensity < 0.02)
                        continue;

                    // core
                    var coreT = Math.max(0, 1 - xDist / (effEnv * 0.35));
                    coreT = coreT * coreT * (1 - yN * 0.6);
                    // inline color lerp + rgba to avoid object allocation
                    var br = colors.base.r + (colors.bright.r - colors.base.r) * coreT;
                    var bg = colors.base.g + (colors.bright.g - colors.base.g) * coreT;
                    var bb = colors.base.b + (colors.bright.b - colors.base.b) * coreT;
                    ctx.fillStyle = "rgba(" + Math.round(br * 255) + "," + Math.round(bg * 255) + "," + Math.round(bb * 255) + "," + root.alphaStr(intensity * 0.85) + ")";
                    ctx.fillRect(ix * cellSize, yPx - cellSize, cellSize + 0.5, cellSize + 0.5);
                }
            }
            // sparks — max 1-2 per frame
            if (Math.random() < load * 0.6) {
                var angle = -1.5708 + (Math.random() - 0.5) * 0.7;
                var speed = 15 + Math.random() * 25 * load;
                root.spawnParticle(w * (0.3 + 0.4 * Math.random()), h - Math.random() * flameH * 0.25, Math.cos(angle) * speed, Math.sin(angle) * speed, 3 + Math.random() * 4, (2 + Math.random() * 3) * root.particleSize, 0);
            }
            drawParticlesSimple(ctx, colors.bright);
        }

        // ───────────────────────────────────
        // STYLE 1: Ember — particle cloud
        // Perf: NO createRadialGradient per particle, just circles + one global glow
        // ───────────────────────────────────
        function drawEmber(ctx, w, h, dt, load, time, colors, flameH) {
            // base glow (single gradient)
            if (!root.transparentBg) {
                var grd = ctx.createRadialGradient(w / 2, h + 5, 3, w / 2, h - flameH * 0.3, w * 0.45);
                grd.addColorStop(0, root.rgba(colors.base, 0.18 * load));
                grd.addColorStop(0.6, root.rgba(colors.glow, 0.06 * load));
                grd.addColorStop(1, "transparent");
                ctx.fillStyle = grd;
                ctx.fillRect(0, 0, w, h);
            }
            // spawn: like classic mode - single chance-based spawn per frame
            if (Math.random() < 0.04 + load * 0.6) {
                var cx2 = w / 2 + (Math.random() - 0.5) * w * 0.45 * (0.4 + 0.6 * load);
                var cy2 = h - Math.random() * 6;
                var angle = -1.5708 + (Math.random() - 0.5) * 0.9;
                var speed = 8 + Math.random() * 20 + load * 15;
                var ptype = Math.random() < 0.25 ? 1 : 0;
                root.spawnParticle(cx2, cy2, Math.cos(angle) * speed, Math.sin(angle) * speed, 3 + Math.random() * 5, (3 + Math.random() * 6) * root.particleSize, ptype);
            }
            // draw all particles as simple filled circles (no per-particle gradient!)
            var pool = root.particles;
            var bStr = root.brightRgba;
            var baseStr = root.baseRgba;
            for (var i = 0; i < pool.length; i++) {
                var p = pool[i];
                if (!p.alive)
                    continue;

                var lr = p.life / p.maxLife;
                var fadeIn = Math.min(1, (1 - lr) * 6);
                var fadeOut = lr * lr; // quadratic fade — smoother than pow(lr,0.6)
                var alpha = fadeIn * fadeOut;
                if (alpha < 0.02)
                    continue;

                var sz = p.size * (0.4 + 0.6 * lr);
                ctx.beginPath();
                ctx.arc(p.x, p.y, sz, 0, 6.2832);
                if (p.ptype === 1) {
                    // bright spark — slightly larger, brighter
                    ctx.fillStyle = "rgba(" + bStr + "," + root.alphaStr(alpha * 0.85) + ")";
                    ctx.fill();
                    // cheap glow: draw same circle bigger with low alpha (no gradient)
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, sz * 2.2, 0, 6.2832);
                    ctx.fillStyle = "rgba(" + bStr + "," + root.alphaStr(alpha * 0.15) + ")";
                    ctx.fill();
                } else {
                    ctx.fillStyle = "rgba(" + baseStr + "," + root.alphaStr(alpha * 0.7) + ")";
                    ctx.fill();
                }
            }
            // one central glow column (single gradient)
            if (flameH > 10) {
                var glowGrd = ctx.createRadialGradient(w / 2, h - flameH * 0.35, 2, w / 2, h - flameH * 0.3, flameH * 0.35);
                glowGrd.addColorStop(0, root.rgba(colors.bright, 0.06 + 0.1 * load));
                glowGrd.addColorStop(1, "transparent");
                ctx.fillStyle = glowGrd;
                ctx.fillRect(0, 0, w, h);
            }
        }

        // ───────────────────────────────────
        // STYLE 2: Plasma — energy orb
        // Perf: fewer wisps, simpler particle draw
        // ───────────────────────────────────
        function drawPlasma(ctx, w, h, dt, load, time, colors, flameH) {
            var minDim = Math.min(w, h);
            var orbR = (8 + load * 32) * minDim / 160;
            var cx2 = w / 2;
            var cy2 = h - h * 0.15 - orbR * (0.5 + load * 0.5);
            // outer aura (single gradient)
            if (!root.transparentBg) {
                var auraR = orbR * 2.5 + load * 15;
                var grd = ctx.createRadialGradient(cx2, cy2, orbR * 0.5, cx2, cy2, auraR);
                grd.addColorStop(0, root.rgba(colors.base, 0.1 + 0.06 * load));
                grd.addColorStop(0.5, root.rgba(colors.glow, 0.04));
                grd.addColorStop(1, "transparent");
                ctx.fillStyle = grd;
                ctx.fillRect(0, 0, w, h);
            }
            // wisps — max 5 (was 9)
            var wispCount = Math.min(5, 2 + Math.round(load * 4));
            ctx.lineWidth = 1.2 + load * 1.5;
            ctx.lineCap = "round";
            for (var wi = 0; wi < wispCount; wi++) {
                var baseAngle = (wi / wispCount) * 6.2832 + time * 0.3;
                var wispLen = orbR * (1 + load * 2) + root.fbm3(wi * 7.3, time * 0.4) * orbR * 0.7;
                ctx.beginPath();
                for (var seg = 0; seg <= 8; seg++) {
                    // 8 segments (was 12)
                    var t = seg / 8;
                    var drift = root.fbm3(wi * 5.1 + t * 3, time * 0.6) * 12 * t;
                    var wAngle = baseAngle + Math.sin(time * 0.7 + wi * 2.1) * 0.5 * t;
                    var r = orbR * 0.8 + wispLen * t;
                    var px = cx2 + Math.cos(wAngle) * r + drift;
                    var py = cy2 - Math.abs(Math.sin(wAngle)) * r * 0.3 - t * wispLen * 0.7;
                    if (seg === 0)
                        ctx.moveTo(px, py);
                    else
                        ctx.lineTo(px, py);
                }
                var wAlpha = (0.12 + 0.12 * load) * (0.7 + 0.3 * root.noise(wi, time));
                ctx.strokeStyle = "rgba(" + root.baseRgba + "," + root.alphaStr(wAlpha) + ")";
                ctx.stroke();
            }
            // orb core — 2 layers (was 4)
            for (var layer = 1; layer >= 0; layer--) {
                var lr = orbR * (0.45 + layer * 0.35);
                var grd2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, lr);
                var pulse = 0.85 + 0.15 * Math.sin(time * 2 + layer);
                var layerA = (1 - layer * 0.35) * pulse;
                grd2.addColorStop(0, root.rgba(colors.bright, 0.85 * layerA));
                grd2.addColorStop(0.5, root.rgba(colors.base, 0.4 * layerA));
                grd2.addColorStop(1, "transparent");
                ctx.fillStyle = grd2;
                ctx.beginPath();
                ctx.arc(cx2, cy2, lr, 0, 6.2832);
                ctx.fill();
            }
            // orbiting sparks — max 1-2 per frame
            if (Math.random() < load * 0.7) {
                var sAngle = Math.random() * 6.2832;
                var dist = orbR * (0.7 + Math.random() * 0.4);
                var speed = 15 + load * 20;
                var tangent = sAngle + 1.5708 + (Math.random() - 0.5) * 1;
                root.spawnParticle(cx2 + Math.cos(sAngle) * dist, cy2 + Math.sin(sAngle) * dist * 0.6, Math.cos(tangent) * speed + (Math.random() - 0.5) * 8, Math.sin(tangent) * speed - 8 - Math.random() * 15, 2 + Math.random() * 4, (2 + Math.random() * 4) * root.particleSize, Math.random() < 0.35 ? 1 : 0);
            }
            // draw particles with gravity toward orb
            var pool = root.particles;
            var bStr = root.brightRgba;
            var bsStr = root.baseRgba;
            for (var i = 0; i < pool.length; i++) {
                var p = pool[i];
                if (!p.alive)
                    continue;

                // gravity toward orb center
                var dx = cx2 - p.x, dy = cy2 - p.y;
                var dd = Math.sqrt(dx * dx + dy * dy) || 1;
                p.vx += dx / dd * 6 * dt;
                p.vy += dy / dd * 3 * dt - 12 * dt;
                var lr2 = p.life / p.maxLife;
                var alpha = lr2 * 0.7;
                if (alpha < 0.02)
                    continue;

                var sz = p.size * (0.3 + 0.7 * lr2);
                ctx.beginPath();
                ctx.arc(p.x, p.y, sz, 0, 6.2832);
                ctx.fillStyle = "rgba(" + (p.ptype === 1 ? bStr : bsStr) + "," + root.alphaStr(alpha) + ")";
                ctx.fill();
            }
        }

        // ───────────────────────────────────
        // Simple particle draw (for Classic style)
        // ───────────────────────────────────
        function drawParticlesSimple(ctx, brightColor) {
            var pool = root.particles;
            var bStr = root.brightRgba;
            for (var i = 0; i < pool.length; i++) {
                var p = pool[i];
                if (!p.alive)
                    continue;

                var alpha = (p.life / p.maxLife) * 0.65;
                if (alpha < 0.02)
                    continue;

                var sz = p.size * (0.5 + 0.5 * p.life / p.maxLife);
                ctx.beginPath();
                ctx.arc(p.x, p.y, sz, 0, 6.2832);
                ctx.fillStyle = "rgba(" + bStr + "," + root.alphaStr(alpha) + ")";
                ctx.fill();
            }
        }

        z: 0
        anchors.fill: parent
        visible: root.useCanvasRenderer
        renderStrategy: Canvas.Threaded
        onPainted: root.painting = false
        onPaint: {
            var ctx = getContext("2d");
            var w = width, h = height;
            ctx.clearRect(0, 0, w, h);
            if (w < 4 || h < 4) {
                root.painting = false;
                return ;
            }
            var load = root.cpuLoad;
            var time = root.animTime;
            var dt = root.frameInterval / 1000;
            var colors = root.frameColors;
            var flameH = (0.06 + 0.94 * load) * h;
            if (root.flameStyle === 0)
                drawClassic(ctx, w, h, dt, load, time, colors, flameH);
            else if (root.flameStyle === 1)
                drawEmber(ctx, w, h, dt, load, time, colors, flameH);
            else
                drawPlasma(ctx, w, h, dt, load, time, colors, flameH);
        }
    }

}
