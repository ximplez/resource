#!/bin/bash

GetSysInfo(){
	if [ -s "/etc/redhat-release" ];then
		SYS_VERSION=$(cat /etc/redhat-release)
	elif [ -s "/etc/issue" ]; then
		SYS_VERSION=$(cat /etc/issue)
	fi
	SYS_INFO=$(uname -a)
	SYS_BIT=$(getconf LONG_BIT)
	MEM_TOTAL=$(free -m|grep Mem|awk '{print $2}')
	CPU_INFO=$(getconf _NPROCESSORS_ONLN)

	echo -e ${SYS_VERSION}
	echo -e Bit:${SYS_BIT} Mem:${MEM_TOTAL}M Core:${CPU_INFO}
	echo -e ${SYS_INFO}
}
Red_Error(){
	echo '=================================================';
	printf '\033[1;31;40m%b\033[0m\n' "$1";
	GetSysInfo
	exit 1;
}
function showGreen()
{ 
    echo -e "\033[32m $1 \033[0m"
}
function showBlue()
{ 
    echo -e  "\033[36m $1 \033[0m"
}
function showYellow()
{ 
    echo -e "\033[33m $1 \033[0m"
}
function showWhite()
{ 
    echo -e  "\033[37m $1 \033[0m"
}

help(){
cat << END
    一个自助脚本
    ...
END
exit 1
}

log(){
  showGreen "======================================================================================="
  showGreen "=="
  showYellow "=="$(date '+%Y-%m-%d %H:%M:%S')" INFO:  $@"
  showGreen "=="
  showGreen "======================================================================================="
}

# 
# 初始化
# 
init(){
  apt-get -y update
  echo y | apt-get -y upgrade
  apt-get -y install git zsh curl wget

  # 安装oh-my-zsh
  log "安装oh-my-zsh请输入y，以进入新shell继续执行后续美化步骤~"
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh)"
  log "确认已输入y进入新shell后，再次执行本脚本！"
}

# 
# 控制台美化
# 
beautiful_zsh(){
  log "开始控制台美化！"
  cd ~
  if [ ! -d "init" ] 
  then
    mkdir init
  fi
  cd init
  apt-get install autojump -y

  git clone https://github.com/fcamblor/oh-my-zsh-agnoster-fcamblor.git
  ./oh-my-zsh-agnoster-fcamblor/install
  git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting
  cd ~

  sed -i 's|ZSH_THEME=".*"|ZSH_THEME="agnoster"|' ~/.zshrc
  sed -i '$a source ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh' ~/.zshrc
  sed -i '$a [[ -s /root/.autojump/etc/profile.d/autojump.sh ]] && source /root/.autojump/etc/profile.d/autojump.sh \nautoload -U compinit && compinit -u' ~/.zshrc
  sed -i '/plugins=(.*)/s/)/ autojump zsh-syntax-highlighting)/' ~/.zshrc

  source ~/.zshrc
  cd ~
}

# 
# 系统配置
# 
sys_config(){
  log "开始系统设置！"
  # 设置时区
  cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
  # 配置ssh
  ssh_config
}

v2ray(){
  sh -c "$(curl -fsSL https://git.io/v2ray.sh)"
}

# 
# ssh配置
# 
ssh_config(){
  apt-get update -y
  apt-get install curl -y
  yum clean all
  yum make cache
  yum install curl -y
  showBlue '============================
    SSH Key Installer
    V1.0 Alpha
    Author:Kirito
  ============================'
  read -p '请输入github 用户名以获取公钥：' name
  if [[ ! $name ]] ;then 
    Red_Error 'github 用户名 不能为空'
  fi
  showYellow "ssh public key ====> https://github.com/$name.keys"
  read -p '请输入ssh端口（默认19596）：' port
  if [[ ! $port ]] ;then 
    port=19596
  fi
  showYellow "new Port ====> $port"
  cd ~
  mkdir -p .ssh
  cd .ssh
  curl https://github.com/$name.keys > authorized_keys
  chmod 700 authorized_keys
  cd ../
  chmod 600 .ssh
  cd /etc/ssh/

  sed -i "/PasswordAuthentication no/c PasswordAuthentication no" sshd_config
  # sed -i "/RSAAuthentication no/c RSAAuthentication yes" sshd_config
  sed -i "/PubkeyAuthentication no/c PubkeyAuthentication yes" sshd_config
  sed -i "/PasswordAuthentication yes/c PasswordAuthentication no" sshd_config
  # sed -i "/RSAAuthentication yes/c RSAAuthentication yes" sshd_config
  sed -i "/PubkeyAuthentication yes/c PubkeyAuthentication yes" sshd_config
  sed -i "s|.*Port=.*|Port=$port|" /etc/ssh/sshd_config
  sed -i "s|.*Port .*|Port $port|" /etc/ssh/sshd_config
  # 一个小时ssh保活
  sed -i "s|.*ClientAliveInterval .*|ClientAliveInterval 1200|" /etc/ssh/sshd_config
  sed -i "s|.*ClientAliveCountMax .*|ClientAliveCountMax 3|" /etc/ssh/sshd_config
  service sshd restart
  service ssh restart
  systemctl restart sshd
  systemctl restart ssh
  cd ~
  rm -rf key.sh
}

# 
# 系统DD
# 
SystemDD(){
  read -p '即将开始系统dd，请确认：(y/n)' dd
  if [[ $dd != 'y' ]] ;then 
    Start
  else 
    read -p '请输入系统密码：' psw
    if [[ ! $psw ]] ;then 
      Red_Error '密码 不能为空'
    fi
    apt-get update&apt-get install -y xz-utils openssl gawk file
    wget --no-check-certificate -O dd.sh https://raw.githubusercontent.com/ximplez/resource/main/vps/dd.sh && chmod a+x dd.sh && bash dd.sh -d 12 -v 64 -a -p $psw
  fi
}

# 
#  菜单
# 
Start(){
  cat << END
    0. 退出
    1. 初始化（默认安装zsh，最后请输入y，切换到新shell，否则无法美化）
    2. ZSH美化（强依赖初始化步骤）
    4. 系统设置
    5. 安装v2ray
    99. 系统DD
END
  read -p "请输入你的选择: " step
  case $step in
      1) init ;;
      2) beautiful_zsh ;;
      4) sys_config ;;
      5) v2ray ;;
      99) SystemDD ;;
  esac
  log "脚本执行完毕！"
}

Start
