export function browserLaunchOptions() {
  return process.env.LIMINAL_SOFTWARE_RENDERING === "1"
    ? { args: ["--use-gl=angle", "--use-angle=swiftshader"] }
    : {}
}
