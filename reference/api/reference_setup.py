import os

from django.contrib.auth import get_user_model
from django.core.management import call_command

from care.users.models import PlugConfig

# care's demo data creates care-admin, so it is only loaded into a fresh database.
if not get_user_model().objects.filter(username="care-admin").exists():
    call_command("load_fixtures")

# care_fe loads the plug from this address; the web container serves it under /abdm/.
PlugConfig.objects.update_or_create(
    slug="abdm",
    defaults={
        "meta": {
            "url": f"{os.environ['REFERENCE_URL']}/abdm/assets/remoteEntry.js",
            "name": "care_abdm_fe",
            "plug": "abdm",
        }
    },
)

print(f"CARE is ready at {os.environ['REFERENCE_URL']}")  # noqa: T201
