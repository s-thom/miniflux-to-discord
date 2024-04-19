# Miniflux to Discord

A webhook handler for the feed reader [Miniflux](https://miniflux.app/index.html) that forwards messages to Discord.

I create this as the existing integration path, using Apprise, isn't quite what I'm looking for. In particular, each entry will link back to the Miniflux instance rather than the original website. Plus I also thought this would be a much smaller project than it ended up being, but that's really my fault for over-engineering it.

## Installation

Check [.env.example](./.env.example) for environment variables that must/should be set.

```sh
npm ci
npm run build
node dist/index.js
```

There's also a Dockerfile for those using Docker.
