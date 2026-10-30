# Android release signing

All upcoming app updates and releases must be signed with the new release keystore stored in this repository's GitHub Actions secrets. Its SHA-1 fingerprint is `0E:99:5C:AC:1F:4D:50:8C:C8:EC:1D:49:1B:6F:F9:68:19:D8:7B:E3`; it has been in use since v1.545 (version code 523).

The old signing key is lost and must not be used. The keystore backup is saved in the workspace; do not delete it.