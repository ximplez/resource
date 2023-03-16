#!/bin/bash

while getopts ":i:e:u:p:a" opt
do
    case $opt in
        i)
            IMAGE_NAME=$OPTARG
            ;;
        e)
            BUILD_ENV=$OPTARG
            ;;
        u)
            DOCKER_USERNAME=$OPTARG
            ;;
        p)
            DOCKER_PASSWORD=$OPTARG
            ;;
        a)
            DOCKER_RUN_ARGS=$OPTARG
            ;;
        ?)
            echo "未知参数 $OPTARG"
            ;;
        :)
            echo "没有输入任何选项 $OPTARG"
            ;;
        *)
            # 发生不能预料的错误时。
            echo "处理选项时出现未知错误"
            ;;
    esac
done

echo '[INFO] 开始执行脚本 ...'
echo '[INFO] 当前路径 :'
echo `pwd`
echo '[INFO] 当前路径文件 ...'
echo `ls`
echo '[INFO] 开始环境准备 ...'
REGISTRY=${IMAGE_NAME%%/*}
tmp=${IMAGE_NAME##*/}
PROJECT_NAME=${tmp%:*}
CONTAINER_NAME=$PROJECT_NAME-$BUILD_ENV
BASE_IMAGE_NAME=${IMAGE_NAME%:*}
printf "env:
    IMAGE_NAME=%s
    BASE_IMAGE_NAME=%s
    REGISTRY=%s
    BUILD_ENV=%s
    PROJECT_NAME=%s
    CONTAINER_NAME=%s
    DOCKER_RUN_ARGS=%s
end
" $IMAGE_NAME $BASE_IMAGE_NAME $REGISTRY $BUILD_ENV $PROJECT_NAME $CONTAINER_NAME $DOCKER_RUN_ARGS
echo '[INFO] 环境准备完成 ...'
if [[ $DOCKER_USERNAME ]] ;then 
    echo "[INFO] 登陆 $REGISTRY --- user: $DOCKER_USERNAME ..."
    res=`cat $DOCKER_PASSWORD | docker login $REGISTRY --username=$DOCKER_USERNAME --password-stdin`
    if [[ $res =~ "Succeeded" ]] ;then
        echo "[INFO] 登陆成功"
    else
        echo "[ERROR] 登陆失败"
        echo $res
        exit 1;
    fi
fi
echo "[INFO] 停止容器 $CONTAINER_NAME..."
echo `docker stop $CONTAINER_NAME`
echo "[INFO] 删除容器 $CONTAINER_NAME..."
echo `docker rm $CONTAINER_NAME`
echo "[INFO] 删除镜像 $BASE_IMAGE_NAME..."
echo `docker rmi -f $BASE_IMAGE_NAME`
echo "[INFO] 拉取镜像 $IMAGE_NAME..."
echo `docker pull $IMAGE_NAME`
echo "[INFO] 启动镜像 $CONTAINER_NAME..."
set -x
echo `docker run -d --name $CONTAINER_NAME -v /opt/applogs/$PROJECT_NAME:/log $DOCKER_RUN_ARGS $IMAGE_NAME`
echo "[INFO] 启动完成!"
exit 0
