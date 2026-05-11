declare namespace Openness.open {

  type LoginConfigRegister = {
    emailSuffix: string // 注册邮箱后缀
    openRegister: boolean // 开放注册
  }

  type LoginVcodeResponse = {
    loginCaptcha: boolean
    register: LoginConfigRegister
  }
}
