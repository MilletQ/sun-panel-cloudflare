declare namespace System.Register{
  type SendRegisterVcodeRquest = {
    email?: string
    username?: string
    password?: string
    vcode?: string
    emailVCode?: string
    verification?: Common.VerificationRequest
    referralCode?: string
  }

  type CommitRquest = {

  } & SendRegisterVcodeRquest

}
