import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

/** Operational failure screen (S06/S10). A failed lazy chunk (for example after an
 * update or a dropped connection) must not leave a raw developer error page. Saved
 * server records are unaffected; per-tab drafts remain in session storage. */
export default function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error'
  const chunk = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(message)
  return (
    <main className="route-error" role="alert">
      <h1>{chunk ? 'Part of InfraShader could not be loaded' : 'Something went wrong'}</h1>
      <p>
        {chunk
          ? 'The application may have been updated or the connection was interrupted. Reload to continue.'
          : 'This screen could not be displayed. Reload to try again.'}{' '}
        Saved records are unaffected; unsaved drafts in this tab are kept where supported.
      </p>
      <p>
        <button className="button primary" type="button" onClick={() => window.location.reload()}>
          Reload InfraShader
        </button>
      </p>
      <details>
        <summary>Technical detail</summary>
        <code>{message}</code>
      </details>
    </main>
  )
}
