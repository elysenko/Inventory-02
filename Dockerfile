# Root-level fallback for deploy tooling that builds "the app image" from the repo
# root with an implicit `docker build .` (context=".", dockerfile="Dockerfile") rather
# than honoring colossus.yaml's `buildDir: frontend`. Mirrors the known-good
# frontend/Dockerfile exactly, only with COPY sources rebased onto the root build
# context. Keep this in sync with frontend/Dockerfile if that file changes.
FROM ubuntu:30500/colossus-base-angular:v2 AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
# Compare only dependencies+devDependencies — the app may rename itself, but the dep
# SET is what the seed prebaked. Byte-compare would miss on harmless name edits.
RUN if node -e "const a=require('./package.json'),b=require('/opt/colossus/angular-warmup/package.json');const k=o=>JSON.stringify([o.dependencies||{},o.devDependencies||{}]);process.exit(k(a)===k(b)?0:1)"; then \
      echo 'angular-warmup seed HIT: reusing prebaked node_modules (npm install skipped)'; \
      cp -a /opt/colossus/angular-warmup/node_modules ./node_modules; \
    else \
      echo 'angular-warmup seed MISS: dep set diverged from template — npm install fallback'; \
      npm install --no-audit --no-fund --loglevel=error; \
    fi
COPY frontend/ .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
