#!/bin/bash
# One-off setup after migrations: demo data on the first run, and the ABDM frontend plug's address.
set -eo pipefail

./wait_for_db.sh

python manage.py shell < reference_setup.py
