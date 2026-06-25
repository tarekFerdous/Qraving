import { redirect } from "next/navigation";

// Root path — redirect to a default path or just render the catch-all shell
export default function RootPage() {
  redirect("/home");
}
