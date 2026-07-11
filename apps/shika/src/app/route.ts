import {NextResponse, type NextRequest} from "next/server";

import {defaultLocale} from "@/i18n/routing";

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(`/${defaultLocale}`, request.url));
}
