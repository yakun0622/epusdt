package dao

import (
	"github.com/GMWalletApp/epusdt/config"
	"github.com/spf13/viper"
	"gorm.io/gorm"
)

var Mdb *gorm.DB

func DBInit() error {
	dbType, err := config.PrimaryDatabaseType(viper.GetViper())
	if err != nil {
		return err
	}
	if dbType == "mysql" {
		err = MysqlInit()
	} else {
		err = SqliteInit()
	}
	if err != nil {
		return err
	}

	return MdbTableInit()
}
