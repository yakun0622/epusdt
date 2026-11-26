package dao

import (
	"errors"
	"fmt"
	"net"
	"time"

	"github.com/GMWalletApp/epusdt/config"
	mysqlconfig "github.com/go-sql-driver/mysql"
	"github.com/spf13/viper"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func MysqlInit() error {
	host := viper.GetString("mysql_host")
	database := viper.GetString("mysql_database")
	if host == "" || database == "" {
		return errors.New("MySQL requires mysql_host and mysql_database")
	}
	port := viper.GetString("mysql_port")
	if port == "" {
		port = "3306"
	}

	dsn := mysqlconfig.NewConfig()
	dsn.User = viper.GetString("mysql_user")
	dsn.Passwd = viper.GetString("mysql_passwd")
	dsn.Net = "tcp"
	dsn.Addr = net.JoinHostPort(host, port)
	dsn.DBName = database
	dsn.ParseTime = true
	dsn.Loc = time.Local
	dsn.Params = map[string]string{"charset": "utf8mb4"}

	db, err := gorm.Open(mysql.Open(dsn.FormatDSN()), &gorm.Config{
		NamingStrategy: schema.NamingStrategy{
			TablePrefix:   viper.GetString("mysql_table_prefix"),
			SingularTable: true,
		},
		Logger: logger.Default.LogMode(logger.Error),
	})
	if err != nil {
		return fmt.Errorf("open MySQL database: %w", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("get MySQL connection pool: %w", err)
	}
	sqlDB.SetMaxIdleConns(viper.GetInt("mysql_max_idle_conns"))
	sqlDB.SetMaxOpenConns(viper.GetInt("mysql_max_open_conns"))
	sqlDB.SetConnMaxLifetime(time.Hour * time.Duration(viper.GetInt("mysql_max_life_time")))

	if config.SQLDebug {
		db = db.Debug()
	}
	Mdb = db
	return nil
}
