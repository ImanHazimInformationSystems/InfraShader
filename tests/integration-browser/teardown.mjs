export default async function teardown() {
  const response = await fetch(`${process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'}/fixture/cleanup`, { method: 'POST' })
  if (!response.ok) throw new Error('Browser test schema cleanup failed; inspect the disposable test database.')
}
