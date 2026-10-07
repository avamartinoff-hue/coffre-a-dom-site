/* =========================================================
   Battement de cœur des tâches planifiées.
   Écrit la date de dernier passage dans app_config (clé cron_<nom>_last)
   afin de vérifier de l'extérieur qu'une tâche cron s'exécute réellement.
   Toujours non bloquant : un échec d'écriture ne perturbe jamais la tâche.
   Env : SUPABASE_URL + SUPABASE_SECRET_KEY (service_role, bypass RLS).
   ========================================================= */
async function beat(name) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/app_config`, {
      method: 'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ key: `cron_${name}_last`, value: new Date().toISOString() }),
    });
  } catch (e) { /* non bloquant */ }
}
module.exports = { beat };
