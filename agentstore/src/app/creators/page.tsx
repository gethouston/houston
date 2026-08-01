import { redirect } from "next/navigation";

/** The creators directory lives on the Home behind the view switcher now;
 *  this route survives only so old links keep working. */
export default function CreatorsPage() {
  redirect("/?view=creators");
}
