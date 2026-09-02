import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}

// Play release builds must use an upload keystore. CI can explicitly opt into
// debug signing only for compile verification; that artifact must never be uploaded.
val keystoreProperties = Properties().apply {
    val propertiesFile = rootProject.file("key.properties")
    if (propertiesFile.exists()) {
        propertiesFile.inputStream().use { load(it) }
    }
}
val releaseSigningKeys = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
val missingReleaseSigningKeys = releaseSigningKeys.filter {
    keystoreProperties.getProperty(it).isNullOrBlank()
}
val releaseKeystore = keystoreProperties.getProperty("storeFile")
    ?.takeIf { it.isNotBlank() }
    ?.let(rootProject::file)
val hasReleaseKeystore = missingReleaseSigningKeys.isEmpty() && releaseKeystore?.isFile == true
val allowDebugReleaseSigning = providers.gradleProperty("allowDebugReleaseSigning")
    .orNull
    ?.toBooleanStrictOrNull() == true

gradle.taskGraph.whenReady {
    val releaseRequested = allTasks.any {
        it.name == "assembleRelease" || it.name == "bundleRelease"
    }
    if (releaseRequested && !hasReleaseKeystore && !allowDebugReleaseSigning) {
        val detail = when {
            missingReleaseSigningKeys.isNotEmpty() ->
                "Missing key.properties values: ${missingReleaseSigningKeys.joinToString()}"
            else -> "Keystore file does not exist: ${releaseKeystore?.path ?: "storeFile is missing"}"
        }
        throw org.gradle.api.GradleException(
            "Release signing is not configured. $detail. " +
                "Configure android/key.properties for Play uploads. " +
                "For CI compile verification only, set " +
                "ORG_GRADLE_PROJECT_allowDebugReleaseSigning=true."
        )
    }
}

android {
    namespace = "com.culturepath.frontend"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.culturepath.frontend"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["mapsApiKey"] = localProperties.getProperty("maps.apiKey", "")
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else if (allowDebugReleaseSigning) {
                logger.warn(
                    "CI-only debug signing is enabled for a release compile check. " +
                        "Do not upload this artifact to Google Play."
                )
                signingConfigs.getByName("debug")
            } else {
                null
            }
        }
    }
}

flutter {
    source = "../.."
}
