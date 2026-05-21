export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSimulatorDaemon } = await import("./lib/daemon");
    startSimulatorDaemon();
  }
}
