import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

Item {
    id: page

    readonly property string localeName: (Qt.locale().name || "en_US").toLowerCase()
    property string title: l10n("General")
    property alias cfg_lowTemp: lowTempSpinBox.value
    property int cfg_lowTempDefault
    property alias cfg_highTemp: highTempSpinBox.value
    property int cfg_highTempDefault
    property alias cfg_updateInterval: updateIntervalSpinBox.value
    property int cfg_updateIntervalDefault
    property alias cfg_tempSensorPath: tempSensorPathField.text
    property string cfg_tempSensorPathDefault
    property alias cfg_showLoadText: showLoadTextCheckBox.checked
    property bool cfg_showLoadTextDefault
    property alias cfg_showTempText: showTempTextCheckBox.checked
    property bool cfg_showTempTextDefault
    property alias cfg_maxTextSize: maxTextSizeSpinBox.value
    property int cfg_maxTextSizeDefault
    property alias cfg_transparentBackground: transparentBgCheckBox.checked
    property bool cfg_transparentBackgroundDefault
    property alias cfg_flameStyle: flameStyleCombo.currentIndex
    property int cfg_flameStyleDefault
    property alias cfg_renderBackend: renderBackendCombo.currentIndex
    property int cfg_renderBackendDefault
    property alias cfg_widgetFps: widgetFpsSpinBox.value
    property int cfg_widgetFpsDefault
    property alias cfg_batteryFps: batteryFpsSpinBox.value
    property int cfg_batteryFpsDefault
    property alias cfg_particleSize: particleSizeSpinBox.value
    property int cfg_particleSizeDefault
    property alias cfg_particleCount: particleCountSpinBox.value
    property int cfg_particleCountDefault
    property alias cfg_panelWidth: panelWidthSpinBox.value
    property int cfg_panelWidthDefault
    readonly property var translations: ({
        "zh_CN": {
            "General": "常规",
            "CPU Flame": "CPU火焰",
            "Tune the look first, then tweak performance if you need more battery life.": "先调整外观，再根据需要调整性能以节省电量。",
            "Style": "样式",
            "Renderer": "渲染器",
            "Classic - smooth gradient flame": "经典 - 平滑渐变火焰",
            "Ember - particle cloud": "余烬 - 粒子云",
            "Plasma - energy orb with wisps": "等离子 - 带光丝的能量球",
            "Shader (GPU)": "着色器（GPU）",
            "Legacy Canvas (CPU)": "传统 Canvas（CPU）",
            "Transparent background (no glow)": "透明背景（无光晕）",
            "Panel width": "面板宽度",
            "px": "像素",
            "Text Overlay": "文字叠加",
            "Show CPU load": "显示CPU负载",
            "Show temperature": "显示温度",
            "Max text size": "最大文字大小",
            "Temperature": "温度",
            "Low temperature": "低温",
            "High temperature": "高温",
            "Auto-detect sensor path (leave empty)": "自动检测传感器路径（留空）",
            "Examples: /sys/class/thermal/thermal_zone0/temp or /sys/class/hwmon/hwmon*/temp1_input": "示例：/sys/class/thermal/thermal_zone0/temp 或 /sys/class/hwmon/hwmon*/temp1_input",
            "Performance": "性能",
            "Update interval (ms)": "更新间隔（毫秒）",
            "Animation FPS": "动画帧率",
            "Battery FPS": "电池模式帧率",
            "Particle size": "粒子大小",
            "Particle count": "粒子数量"
        },
        "es": {
            "General": "General",
            "CPU Flame": "Llama de CPU",
            "Tune the look first, then tweak performance if you need more battery life.": "Primero ajusta el estilo y luego el rendimiento si necesitas más batería.",
            "Style": "Estilo",
            "Renderer": "Renderizador",
            "Classic - smooth gradient flame": "Clásico - llama con degradado suave",
            "Ember - particle cloud": "Ascuas - nube de partículas",
            "Plasma - energy orb with wisps": "Plasma - orbe de energía con estelas",
            "Shader (GPU)": "Shader (GPU)",
            "Legacy Canvas (CPU)": "Canvas heredado (CPU)",
            "Transparent background (no glow)": "Fondo transparente (sin brillo)",
            "Panel width": "Ancho del panel",
            "px": "px",
            "Text Overlay": "Texto superpuesto",
            "Show CPU load": "Mostrar carga de CPU",
            "Show temperature": "Mostrar temperatura",
            "Max text size": "Tamaño máximo del texto",
            "Temperature": "Temperatura",
            "Low temperature": "Temperatura baja",
            "High temperature": "Temperatura alta",
            "Auto-detect sensor path (leave empty)": "Detectar ruta del sensor automáticamente (dejar vacío)",
            "Examples: /sys/class/thermal/thermal_zone0/temp or /sys/class/hwmon/hwmon*/temp1_input": "Ejemplos: /sys/class/thermal/thermal_zone0/temp o /sys/class/hwmon/hwmon*/temp1_input",
            "Performance": "Rendimiento",
            "Update interval (ms)": "Intervalo de actualización (ms)",
            "Animation FPS": "FPS de animación",
            "Battery FPS": "FPS en batería",
            "Particle size": "Tamaño de partícula",
            "Particle count": "Cantidad de partículas"
        },
        "de": {
            "General": "Allgemein",
            "CPU Flame": "CPU-Flamme",
            "Tune the look first, then tweak performance if you need more battery life.": "Passe zuerst die Optik an und dann die Leistung, wenn du mehr Akkulaufzeit brauchst.",
            "Style": "Stil",
            "Renderer": "Renderer",
            "Classic - smooth gradient flame": "Klassisch - weiche Verlaufsflamme",
            "Ember - particle cloud": "Glut - Partikelwolke",
            "Plasma - energy orb with wisps": "Plasma - Energiekugel mit Schweifen",
            "Shader (GPU)": "Shader (GPU)",
            "Legacy Canvas (CPU)": "Legacy Canvas (CPU)",
            "Transparent background (no glow)": "Transparenter Hintergrund (ohne Leuchten)",
            "Panel width": "Panelbreite",
            "px": "px",
            "Text Overlay": "Textüberlagerung",
            "Show CPU load": "CPU-Last anzeigen",
            "Show temperature": "Temperatur anzeigen",
            "Max text size": "Maximale Textgröße",
            "Temperature": "Temperatur",
            "Low temperature": "Niedrige Temperatur",
            "High temperature": "Hohe Temperatur",
            "Auto-detect sensor path (leave empty)": "Sensorpfad automatisch erkennen (leer lassen)",
            "Examples: /sys/class/thermal/thermal_zone0/temp or /sys/class/hwmon/hwmon*/temp1_input": "Beispiele: /sys/class/thermal/thermal_zone0/temp oder /sys/class/hwmon/hwmon*/temp1_input",
            "Performance": "Leistung",
            "Update interval (ms)": "Aktualisierungsintervall (ms)",
            "Animation FPS": "Animations-FPS",
            "Battery FPS": "Akku-FPS",
            "Particle size": "Partikelgröße",
            "Particle count": "Partikelanzahl"
        },
        "fr": {
            "General": "Général",
            "CPU Flame": "Flamme CPU",
            "Tune the look first, then tweak performance if you need more battery life.": "Réglez d'abord l'apparence, puis la performance si vous avez besoin de plus d'autonomie.",
            "Style": "Style",
            "Renderer": "Moteur de rendu",
            "Classic - smooth gradient flame": "Classique - flamme en dégradé doux",
            "Ember - particle cloud": "Braise - nuage de particules",
            "Plasma - energy orb with wisps": "Plasma - orbe d'énergie avec filaments",
            "Shader (GPU)": "Shader (GPU)",
            "Legacy Canvas (CPU)": "Canvas hérité (CPU)",
            "Transparent background (no glow)": "Arrière-plan transparent (sans halo)",
            "Panel width": "Largeur du panneau",
            "px": "px",
            "Text Overlay": "Texte superposé",
            "Show CPU load": "Afficher la charge CPU",
            "Show temperature": "Afficher la température",
            "Max text size": "Taille maximale du texte",
            "Temperature": "Température",
            "Low temperature": "Température basse",
            "High temperature": "Température élevée",
            "Auto-detect sensor path (leave empty)": "Détecter automatiquement le chemin du capteur (laisser vide)",
            "Examples: /sys/class/thermal/thermal_zone0/temp or /sys/class/hwmon/hwmon*/temp1_input": "Exemples : /sys/class/thermal/thermal_zone0/temp ou /sys/class/hwmon/hwmon*/temp1_input",
            "Performance": "Performance",
            "Update interval (ms)": "Intervalle de mise à jour (ms)",
            "Animation FPS": "FPS d'animation",
            "Battery FPS": "FPS sur batterie",
            "Particle size": "Taille des particules",
            "Particle count": "Nombre de particules"
        },
        "hi": {
            "General": "सामान्य",
            "CPU Flame": "CPU ज्वाला",
            "Tune the look first, then tweak performance if you need more battery life.": "पहले रूप-रंग समायोजित करें, फिर यदि अधिक बैटरी चाहिए तो प्रदर्शन बदलें।",
            "Style": "शैली",
            "Renderer": "रेंडरर",
            "Classic - smooth gradient flame": "क्लासिक - चिकनी ग्रेडिएंट ज्वाला",
            "Ember - particle cloud": "एम्बर - कण बादल",
            "Plasma - energy orb with wisps": "प्लाज़्मा - लहराती धारियों वाला ऊर्जा गोला",
            "Shader (GPU)": "शेडर (GPU)",
            "Legacy Canvas (CPU)": "लीगेसी कैनवास (CPU)",
            "Transparent background (no glow)": "पारदर्शी पृष्ठभूमि (बिना चमक)",
            "Panel width": "पैनल चौड़ाई",
            "px": "पिक्सेल",
            "Text Overlay": "पाठ ओवरले",
            "Show CPU load": "CPU लोड दिखाएं",
            "Show temperature": "तापमान दिखाएं",
            "Max text size": "अधिकतम पाठ आकार",
            "Temperature": "तापमान",
            "Low temperature": "निम्न तापमान",
            "High temperature": "उच्च तापमान",
            "Auto-detect sensor path (leave empty)": "सेंसर पथ स्वतः पहचानें (खाली छोड़ें)",
            "Examples: /sys/class/thermal/thermal_zone0/temp or /sys/class/hwmon/hwmon*/temp1_input": "उदाहरण: /sys/class/thermal/thermal_zone0/temp या /sys/class/hwmon/hwmon*/temp1_input",
            "Performance": "प्रदर्शन",
            "Update interval (ms)": "अपडेट अंतराल (मि.से.)",
            "Animation FPS": "एनीमेशन FPS",
            "Battery FPS": "बैटरी FPS",
            "Particle size": "कण आकार",
            "Particle count": "कण संख्या"
        },
        "ja": {
            "General": "一般",
            "CPU Flame": "CPUフレイム",
            "Tune the look first, then tweak performance if you need more battery life.": "まず見た目を調整し、必要ならバッテリー持ちのために性能を調整してください。",
            "Style": "スタイル",
            "Renderer": "レンダラー",
            "Classic - smooth gradient flame": "クラシック - 滑らかなグラデーション炎",
            "Ember - particle cloud": "エンバー - パーティクル雲",
            "Plasma - energy orb with wisps": "プラズマ - 尾を引くエネルギー球",
            "Shader (GPU)": "Shader（GPU）",
            "Legacy Canvas (CPU)": "レガシー Canvas（CPU）",
            "Transparent background (no glow)": "透明背景（グローなし）",
            "Panel width": "パネル幅",
            "px": "px",
            "Text Overlay": "テキスト表示",
            "Show CPU load": "CPU負荷を表示",
            "Show temperature": "温度を表示",
            "Max text size": "最大文字サイズ",
            "Temperature": "温度",
            "Low temperature": "低温",
            "High temperature": "高温",
            "Auto-detect sensor path (leave empty)": "センサーパスを自動検出（空欄のまま）",
            "Examples: /sys/class/thermal/thermal_zone0/temp or /sys/class/hwmon/hwmon*/temp1_input": "例: /sys/class/thermal/thermal_zone0/temp または /sys/class/hwmon/hwmon*/temp1_input",
            "Performance": "パフォーマンス",
            "Update interval (ms)": "更新間隔 (ms)",
            "Animation FPS": "アニメーションFPS",
            "Battery FPS": "バッテリー時FPS",
            "Particle size": "粒子サイズ",
            "Particle count": "粒子数"
        },
        "pt": {
            "General": "Geral",
            "CPU Flame": "Chama da CPU",
            "Tune the look first, then tweak performance if you need more battery life.": "Ajuste primeiro o visual e depois o desempenho, se precisar de mais bateria.",
            "Style": "Estilo",
            "Renderer": "Renderizador",
            "Classic - smooth gradient flame": "Clássico - chama com gradiente suave",
            "Ember - particle cloud": "Brasa - nuvem de partículas",
            "Plasma - energy orb with wisps": "Plasma - orbe de energia com rastos",
            "Shader (GPU)": "Shader (GPU)",
            "Legacy Canvas (CPU)": "Canvas legado (CPU)",
            "Transparent background (no glow)": "Fundo transparente (sem brilho)",
            "Panel width": "Largura do painel",
            "px": "px",
            "Text Overlay": "Texto sobreposto",
            "Show CPU load": "Mostrar carga da CPU",
            "Show temperature": "Mostrar temperatura",
            "Max text size": "Tamanho máximo do texto",
            "Temperature": "Temperatura",
            "Low temperature": "Temperatura baixa",
            "High temperature": "Temperatura alta",
            "Auto-detect sensor path (leave empty)": "Detetar caminho do sensor automaticamente (deixar vazio)",
            "Examples: /sys/class/thermal/thermal_zone0/temp or /sys/class/hwmon/hwmon*/temp1_input": "Exemplos: /sys/class/thermal/thermal_zone0/temp ou /sys/class/hwmon/hwmon*/temp1_input",
            "Performance": "Desempenho",
            "Update interval (ms)": "Intervalo de atualização (ms)",
            "Animation FPS": "FPS da animação",
            "Battery FPS": "FPS em bateria",
            "Particle size": "Tamanho das partículas",
            "Particle count": "Quantidade de partículas"
        },
        "uk": {
            "General": "Загальне",
            "CPU Flame": "Полум'я CPU",
            "Tune the look first, then tweak performance if you need more battery life.": "Спершу налаштуйте вигляд, а потім продуктивність, якщо потрібна краща автономність.",
            "Style": "Стиль",
            "Renderer": "Рендерер",
            "Classic - smooth gradient flame": "Класичний - плавне градієнтне полум'я",
            "Ember - particle cloud": "Жар - хмара частинок",
            "Plasma - energy orb with wisps": "Плазма - енергетична сфера зі шлейфами",
            "Shader (GPU)": "Шейдер (GPU)",
            "Legacy Canvas (CPU)": "Старий Canvas (CPU)",
            "Transparent background (no glow)": "Прозоре тло (без сяйва)",
            "Panel width": "Ширина панелі",
            "px": "пкс",
            "Text Overlay": "Текстовий оверлей",
            "Show CPU load": "Показувати навантаження CPU",
            "Show temperature": "Показувати температуру",
            "Max text size": "Максимальний розмір тексту",
            "Temperature": "Температура",
            "Low temperature": "Низька температура",
            "High temperature": "Висока температура",
            "Auto-detect sensor path (leave empty)": "Автовизначення шляху до сенсора (залиште порожнім)",
            "Examples: /sys/class/thermal/thermal_zone0/temp or /sys/class/hwmon/hwmon*/temp1_input": "Приклади: /sys/class/thermal/thermal_zone0/temp або /sys/class/hwmon/hwmon*/temp1_input",
            "Performance": "Продуктивність",
            "Update interval (ms)": "Інтервал оновлення (мс)",
            "Animation FPS": "FPS анімації",
            "Battery FPS": "FPS від батареї",
            "Particle size": "Розмір частинок",
            "Particle count": "Кількість частинок"
        }
    })

    function langCode() {
        if (localeName.indexOf("zh") === 0)
            return "zh_CN";

        if (localeName.indexOf("pt_br") === 0)
            return "pt_BR";

        return localeName.split("_")[0];
    }

    function l10n(key) {
        var lang = langCode();
        var table = translations[lang];
        if (!table && lang === "pt_BR")
            table = translations.pt;

        if (table && table[key] !== undefined)
            return table[key];

        return i18n(key);
    }

    QQC2.ScrollView {
        id: scroll

        anchors.fill: parent
        clip: true
        QQC2.ScrollBar.vertical.policy: QQC2.ScrollBar.AsNeeded

        ColumnLayout {
            width: scroll.availableWidth
            spacing: Kirigami.Units.largeSpacing

            QQC2.Frame {
                Layout.fillWidth: true

                ColumnLayout {
                    width: parent.width
                    spacing: Kirigami.Units.smallSpacing

                    QQC2.Label {
                        text: l10n("CPU Flame")
                        font.bold: true
                    }

                    QQC2.Label {
                        Layout.fillWidth: true
                        text: l10n("Tune the look first, then tweak performance if you need more battery life.")
                        wrapMode: Text.WordWrap
                        opacity: 0.85
                    }

                }

                background: Rectangle {
                    radius: Kirigami.Units.cornerRadius
                    color: Qt.rgba(Kirigami.Theme.highlightColor.r, Kirigami.Theme.highlightColor.g, Kirigami.Theme.highlightColor.b, 0.12)
                    border.width: 1
                    border.color: Qt.rgba(Kirigami.Theme.highlightColor.r, Kirigami.Theme.highlightColor.g, Kirigami.Theme.highlightColor.b, 0.35)
                }

            }

            QQC2.GroupBox {
                title: l10n("Style")
                Layout.fillWidth: true

                ColumnLayout {
                    width: parent.width
                    spacing: Kirigami.Units.smallSpacing

                    QQC2.ComboBox {
                        id: flameStyleCombo

                        Layout.fillWidth: true
                        model: [l10n("Classic - smooth gradient flame"), l10n("Ember - particle cloud"), l10n("Plasma - energy orb with wisps")]
                    }

                    RowLayout {
                        Layout.fillWidth: true

                        QQC2.Label {
                            text: l10n("Renderer")
                            Layout.preferredWidth: Kirigami.Units.gridUnit * 8
                        }

                        QQC2.ComboBox {
                            id: renderBackendCombo

                            Layout.fillWidth: true
                            model: [l10n("Shader (GPU)"), l10n("Legacy Canvas (CPU)")]
                        }

                    }

                    QQC2.CheckBox {
                        id: transparentBgCheckBox

                        text: l10n("Transparent background (no glow)")
                    }

                    RowLayout {
                        Layout.fillWidth: true

                        QQC2.Label {
                            text: l10n("Panel width")
                            Layout.preferredWidth: Kirigami.Units.gridUnit * 8
                        }

                        QQC2.SpinBox {
                            id: panelWidthSpinBox

                            from: 24
                            to: 400
                            stepSize: 4
                        }

                        QQC2.Label {
                            text: l10n("px")
                            opacity: 0.7
                        }

                        Item {
                            Layout.fillWidth: true
                        }

                    }

                }

            }

            QQC2.GroupBox {
                title: l10n("Text Overlay")
                Layout.fillWidth: true

                ColumnLayout {
                    width: parent.width
                    spacing: Kirigami.Units.smallSpacing

                    QQC2.CheckBox {
                        id: showLoadTextCheckBox

                        text: l10n("Show CPU load")
                    }

                    QQC2.CheckBox {
                        id: showTempTextCheckBox

                        text: l10n("Show temperature")
                    }

                    RowLayout {
                        Layout.fillWidth: true

                        QQC2.Label {
                            text: l10n("Max text size")
                            Layout.preferredWidth: Kirigami.Units.gridUnit * 8
                        }

                        QQC2.SpinBox {
                            id: maxTextSizeSpinBox

                            from: 6
                            to: 96
                            stepSize: 1
                        }

                        QQC2.Label {
                            text: l10n("px")
                            opacity: 0.7
                        }

                        Item {
                            Layout.fillWidth: true
                        }

                    }

                }

            }

            QQC2.GroupBox {
                title: l10n("Temperature")
                Layout.fillWidth: true

                ColumnLayout {
                    width: parent.width
                    spacing: Kirigami.Units.smallSpacing

                    GridLayout {
                        Layout.fillWidth: true
                        columns: 2
                        columnSpacing: Kirigami.Units.largeSpacing
                        rowSpacing: Kirigami.Units.smallSpacing

                        QQC2.Label {
                            text: l10n("Low temperature")
                        }

                        QQC2.SpinBox {
                            id: lowTempSpinBox

                            from: 0
                            to: 120
                            stepSize: 5
                        }

                        QQC2.Label {
                            text: l10n("High temperature")
                        }

                        QQC2.SpinBox {
                            id: highTempSpinBox

                            from: 0
                            to: 120
                            stepSize: 5
                        }

                    }

                    QQC2.TextField {
                        id: tempSensorPathField

                        Layout.fillWidth: true
                        placeholderText: l10n("Auto-detect sensor path (leave empty)")
                    }

                    QQC2.Label {
                        Layout.fillWidth: true
                        text: l10n("Examples: /sys/class/thermal/thermal_zone0/temp or /sys/class/hwmon/hwmon*/temp1_input")
                        wrapMode: Text.WordWrap
                        opacity: 0.65
                        font.pointSize: Kirigami.Theme.smallFont.pointSize
                    }

                }

            }

            QQC2.GroupBox {
                title: l10n("Performance")
                Layout.fillWidth: true

                ColumnLayout {
                    width: parent.width
                    spacing: Kirigami.Units.smallSpacing

                    RowLayout {
                        Layout.fillWidth: true

                        QQC2.Label {
                            text: l10n("Update interval (ms)")
                            Layout.preferredWidth: Kirigami.Units.gridUnit * 10
                        }

                        QQC2.SpinBox {
                            id: updateIntervalSpinBox

                            from: 500
                            to: 10000
                            stepSize: 500
                        }

                        Item {
                            Layout.fillWidth: true
                        }

                    }

                    RowLayout {
                        Layout.fillWidth: true

                        QQC2.Label {
                            text: l10n("Animation FPS")
                            Layout.preferredWidth: Kirigami.Units.gridUnit * 10
                        }

                        QQC2.SpinBox {
                            id: widgetFpsSpinBox

                            from: 5
                            to: 60
                            stepSize: 5
                        }

                        Item {
                            Layout.fillWidth: true
                        }

                    }

                    RowLayout {
                        Layout.fillWidth: true

                        QQC2.Label {
                            text: l10n("Battery FPS")
                            Layout.preferredWidth: Kirigami.Units.gridUnit * 10
                        }

                        QQC2.SpinBox {
                            id: batteryFpsSpinBox

                            from: 1
                            to: 15
                            stepSize: 1
                        }

                        Item {
                            Layout.fillWidth: true
                        }

                    }

                    RowLayout {
                        Layout.fillWidth: true

                        QQC2.Label {
                            text: l10n("Particle size")
                            Layout.preferredWidth: Kirigami.Units.gridUnit * 10
                        }

                        QQC2.SpinBox {
                            id: particleSizeSpinBox

                            from: 5
                            to: 50
                            stepSize: 1
                            textFromValue: function(value) {
                                return (value / 10).toFixed(1);
                            }
                            valueFromText: function(text) {
                                return Math.round(parseFloat(text) * 10);
                            }
                        }

                        Item {
                            Layout.fillWidth: true
                        }

                    }

                    RowLayout {
                        Layout.fillWidth: true

                        QQC2.Label {
                            text: l10n("Particle count")
                            Layout.preferredWidth: Kirigami.Units.gridUnit * 10
                        }

                        QQC2.SpinBox {
                            id: particleCountSpinBox

                            from: 20
                            to: 200
                            stepSize: 10
                        }

                        Item {
                            Layout.fillWidth: true
                        }

                    }

                }

            }

            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: Kirigami.Units.smallSpacing
            }

        }

    }

}
