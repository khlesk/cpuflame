import QtQuick
import org.kde.plasma.configuration

ConfigModel {
    readonly property string localeName: (Qt.locale().name || "en_US").toLowerCase()

    function categoryTitle() {
        if (localeName.indexOf("zh") === 0)
            return "常规";

        if (localeName.indexOf("es") === 0)
            return "General";

        if (localeName.indexOf("de") === 0)
            return "Allgemein";

        if (localeName.indexOf("fr") === 0)
            return "Général";

        if (localeName.indexOf("hi") === 0)
            return "सामान्य";

        if (localeName.indexOf("ja") === 0)
            return "一般";

        if (localeName.indexOf("pt") === 0)
            return "Geral";

        if (localeName.indexOf("uk") === 0)
            return "Загальне";

        return i18n("General");
    }

    ConfigCategory {
        name: categoryTitle()
        icon: "utilities-system-monitor"
        source: "configGeneral.qml"
    }

}
