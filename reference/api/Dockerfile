# The CARE image built from care develop, with the care-abdm backend plug from care-abdm main.
FROM ghcr.io/ohcnetwork/care:latest

# ADD resolves the branch to its latest commit on every build, so a new care-abdm commit rebuilds from here.
ADD --chown=django:django https://github.com/ohcnetwork/care-abdm.git#main /tmp/care-abdm

# Faker is a care dev dependency that its demo data loader needs.
RUN pip install --no-cache-dir /tmp/care-abdm/backend Faker && rm -rf /tmp/care-abdm

ENV ADDITIONAL_PLUGS='[{"name":"abdm","package_name":"abdm","version":""}]'

COPY --chown=django:django --chmod=0755 reference-entrypoint.sh reference-setup.sh reference_setup.py /app/
