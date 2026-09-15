<div align="center">

<img src="src/assets/singul-agent-icon.png" alt="Shuffle Security Agent" width="96" height="96" />

# Shuffle Security

[Shuffle Security (beta!)](https://shuffle.security) is the open source incident response and security operations frontend for [Shuffle Core](https://shuffler.io) — built for and by security professionals. It brings incidents, host monitoring, vulnerabilities and AI-driven response into a single workspace, designed to work well for SOC teams, MSSPs and service providers. Built to be rebuilt and rebranded.

[_Key Features_](https://shuffle.security/#features) — [_Community & Support_](https://discord.gg/B2CBzUm) — [_Documentation_](https://shuffle.security/docs) — [_Getting Started_](https://shuffle.security/docs/getting-started) — [_Set up a demo call_](https://shuffler.io/contact)

</div>

<table align="center">
  <tr>
    <td width="50%" align="center">
      <a href="https://shuffle.security/incidents"><img alt="Incidents view" src="https://github.com/user-attachments/assets/6f8fef8e-83f2-4912-b14a-981ffca7980f" /></a><br/>
      <sub><a href="https://shuffle.security/incidents"><b>Handle incidents from any source</b></a><br/>One unified view for alerts, cases and tickets across every tool.</sub>
    </td>
    <td width="50%" align="center">
      <a href="https://shuffle.security/automation"><img alt="Automation pipeline" src="https://github.com/user-attachments/assets/e79ae7af-0db8-4d89-be62-706c223b198a" /></a><br/>
      <sub><a href="https://shuffle.security/monitors"><b>Set up host monitors</b></a><br/>For compliance, vulnerabilities and response across your fleet.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="https://shuffle.security/monitors"><img alt="Automation for Incidents" src="public/screenshots/automation-for-incidents.png" /></a><br/>
      <sub><a href="https://shuffle.security/automation"><b>Be in control of the automation</b></a><br/>Visual ingest and forward pipelines you can shape end-to-end.</sub>
    </td>
    <td width="50%" align="center">
      <a href="https://shuffle.security/vulnerabilities"><img alt="Vulnerabilities" src="https://github.com/user-attachments/assets/511cedd8-0a40-4e52-93cc-5638048a45dd" /></a><br/>
      <sub><a href="https://shuffle.security/vulnerabilities"><b>Track and manage vulnerabilities</b></a><br/>Stay on top of risk over time across every asset and user.</sub>
    </td>
  </tr>
</table>

<div align="center">

## Try it

</div>

* Cloud: Register at [https://shuffle.security/register](https://shuffle.security/register) and get cooking
* Self-hosted: see Install below 

## Install (self-hosted)

```bash
git clone https://github.com/Shuffle/shuffle.security
cd shuffle.security
docker compose up -d
```

That is it. Open **http://localhost:3002**. Defaults in `.env` work out of the box — edit them only for production.

## Support
* [Discord](https://discord.gg/B2CBzUm)
* [Twitter](https://twitter.com/shuffleio)
* [Email](mailto:support@shuffler.io)
* [Open issue](https://github.com/Shuffle/shuffle.security/issues/new)
* [Shuffler.io](https://shuffler.io/contact)

## Related repositories
* Shuffle (core platform): [https://github.com/shuffle/shuffle](https://github.com/shuffle/shuffle)
* OpenAPI apps: [https://github.com/shuffle/security-openapis](https://github.com/shuffle/security-openapis)
* Documentation: [https://github.com/shuffle/shuffle-docs](https://github.com/shuffle/shuffle-docs)
* Workflows: [https://github.com/shuffle/shuffle-workflows](https://github.com/shuffle/shuffle-workflows)
* Python apps: [https://github.com/shuffle/python-apps](https://github.com/shuffle/python-apps)

## Features
* Unified Incidents view (OCSF 2005) for alerts and cases
* Observables, assets and IOC correlation with threat intel enrichment
* AI Agent for triage, response suggestions and approvals
* Automation pipelines for ingest and forwarding
* Multi-tenant / sub-organization support for MSSPs
* 3,000+ integrations via the Apps catalog

## Documentation
[Documentation](https://shuffler.io/docs) can be found on [https://shuffler.io/docs](https://shuffler.io/docs) and is written here: [https://github.com/shuffle/shuffle-docs](https://github.com/shuffle/shuffle-docs).

### Setting up a local development environment

```bash
npm install
npm run dev
```

Configure the API target via a `.env` file in the project root:

```env
VITE_SHUFFLE_API_URL=https://shuffler.io
```
