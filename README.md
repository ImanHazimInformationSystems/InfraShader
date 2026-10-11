# InfraShader

Ground-site planning for developer decision review and contractor proposals. Built as React/TypeScript/Vite plus Python 3.12/FastAPI and PostgreSQL/PostGIS. This is an incremental local implementation, not a released or field-validated MVP.

```powershell
npm ci
.\scripts\api.ps1 sync
```

In separate terminals run `.\scripts\api.ps1 dev` and `npm run dev`, then open `http://127.0.0.1:5173`. Explicit Demo mode works without credentials and stores drafts only in the browser. The real workflow implements saved geometry/options, modelled shade, versioned rates, explicit charges, estimates and two immutable PDF outputs.

Local PostgreSQL/PostGIS is installed. Docker/WSL is installed but still needs a Windows restart before local Supabase Auth/Storage can be tested. After restarting, open Docker Desktop, run `.\scripts\supabase.ps1 start` then `.\scripts\supabase.ps1 configure`, and follow the [local user setup](docs/setup.md). Start PostgreSQL with `.\scripts\local-db.ps1 start`.

- [Setup, migrations, tests and service gates](docs/setup.md)
- [Implemented technology stack](docs/technology-stack.md)
- [Maintained build plan](docs/build-plan.md)
- [Actual test evidence and remaining gates](docs/validation.md)
- [Requirements mapped to code/tests](docs/requirements.md)
- [Architecture/API](docs/architecture.md), [decisions](docs/decisions.md), [user guide](docs/user-guide.md)
- [Source inventory and review](docs/reference/README.md)

No push, hosted resources, deployment or paid service was performed. MIT licence; TTP/BTP Project Group 19.
