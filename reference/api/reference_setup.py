import os

from django.contrib.auth import get_user_model
from django.core.management import call_command

from care.users.models import PlugConfig

# care's demo data creates care-admin, so it is only loaded into a fresh database.
if not get_user_model().objects.filter(username="care-admin").exists():
    call_command("load_fixtures")

# The web container serves the plug under /abdm/. care_fe loads it from url and its
# translations from localPath; without localPath it reads /locale/, care_fe's own.
PlugConfig.objects.update_or_create(
    slug="abdm",
    defaults={
        "meta": {
            "url": f"{os.environ['REFERENCE_URL']}/abdm/assets/remoteEntry.js",
            "localPath": "/abdm",
            "name": "care_abdm_fe",
            "plug": "abdm",
        }
    },
)

print(f"CARE is ready at {os.environ['REFERENCE_URL']}")  # noqa: T201
