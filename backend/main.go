package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

const defaultPort = "8080"
const defaultReadTimeout = 10 * time.Second
const defaultWriteTimeout = 10 * time.Second

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins
	},
}

func logForDev(args ...interface{}) {
	if os.Getenv("GO_ENV") == "development" {
		log.Println(args...)
    }
}

type Client struct {
	ID        string
	PartnerID string
	Conn      *websocket.Conn
	Interests []string
	MatchedInterest string
}

var (
	bucket           = []string{}
	interestsBuckets = make(map[string][]string)
	// clientsinterests = make(map[string][]string)
	clients      = make(map[string]*Client)
	clientsMutex sync.Mutex
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, using default environment variables")
	}

	logForDev("env:", os.Getenv("GO_ENV"))

	port := getPort()
	readTimeout := defaultReadTimeout
	writeTimeout := defaultWriteTimeout
	
	server := &http.Server{
		Addr:         ":" + port,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
	}

	http.HandleFunc("/ws", handleConnections)
	http.HandleFunc("/healthcheck", healthCheck)

	fmt.Println("Server listening on port", port)
	log.Fatal(server.ListenAndServe())
}

func getPort() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	return port
}

func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Println("Server is healthy, total clients:", len(clients))
	fmt.Fprintln(w, "Server is healthy, total clients:", len(clients))
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	logForDev("url query ", (r.URL.Query()))
	id := r.URL.Query().Get("id")
	name := r.URL.Query().Get("name")
	logForDev("name:", name)
	clientInterests := r.URL.Query()["interests"]
	var interests []string;
	if(len(clientInterests) > 0) {
		err := json.Unmarshal([]byte(clientInterests[0]), &interests)
		if err != nil {
			fmt.Println("Error unmarshaling interests:", err)
		}
	}
	logForDev("interests:", interests)
	logForDev("len(interests):", len(interests))
	// logForDev("interests[0]:", interests[0])
	logForDev("id:", id)

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("Error upgrading to WebSocket:", err)
		return
	}
	defer ws.Close()

	clientID := id
	if clientID == "" {
		clientID = uuid.New().String()
	}

	if(clients[clientID] != nil) {
		logForDev("removing old client")
		oldClient := clients[clientID]
		disconnectClient(oldClient.ID)
		logForDev("stage 1 ", oldClient.ID, oldClient.PartnerID)
	
		if len(oldClient.Interests) == 0 {
			removeFromBucket(oldClient.ID)
			removeFromBucket(oldClient.PartnerID)
		} else {
			removeFrominterestBuckets(oldClient.ID, oldClient.Interests)
		}
	}

	client := &Client{ID: clientID, Conn: ws, PartnerID: "Null", Interests: interests, MatchedInterest: "Null"}
	clientsMutex.Lock()
	clients[client.ID] = client
	if len(interests) == 0 {
		bucket = append(bucket, client.ID)
	} else {
		// clientsinterests[client.ID] = interests
		// logForDev("clientIntersts xyz", clientsinterests[client.ID])
		for _, interest := range interests {
			if _, ok := interestsBuckets[interest]; !ok {
				interestsBuckets[interest] = []string{}
			}
			interestsBuckets[interest] = append(interestsBuckets[interest], client.ID)
		}
	}
	clientsMutex.Unlock()
	defer func() {
		clientsMutex.Lock()
		logForDev("stage 7")
		delete(clients, client.ID)
		if client.PartnerID != "Null" {
			delete(clients, client.PartnerID)
		}
		clientsMutex.Unlock()
		// clientsMutex.Lock()
		// delete(clients, client.ID)
		// clientsMutex.Unlock()
		// if len(interests) == 0 {
		// 	clientsMutex.Lock()
		// 	// removeFromBucket(client.ID)
		// 	// removeFromBucket(client.PartnerID)
		// 	delete(clients, client.ID)
		// 	delete(clients, client.PartnerID)
		// 	clientsMutex.Unlock()
		// } else {
		// 	clientsMutex.Lock()
		// 	// logForDev("stage 5")
		// 	// removeFrominterestBuckets(client.ID, client.Interests)
		// 	// logForDev("stage 6")
		// 	// removeFrominterestBuckets(client.PartnerID, clients[client.PartnerID].Interests)
		// 	logForDev("stage 7")
		// 	delete(clients, client.ID)
		// 	delete(clients, client.PartnerID)
		// 	clientsMutex.Unlock()
		// }
	}()

	logForDev("Client connected:", client.ID)

	if len(interests) == 0 {
		makeRandomPair(client.ID)
	} else {
		makeRandomPairForinterests(client.ID, interests)
	}

	err = ws.WriteJSON(map[string]string{"id": client.ID, "partnerId": client.PartnerID, "matchedInterest": client.MatchedInterest})
	logForDev("client.PartnerID:", client.PartnerID)
	if err != nil {
		fmt.Println("Error writing ID:", err)
		return
	}
	if client.PartnerID != "Null" {
		err = clients[client.PartnerID].Conn.WriteJSON(map[string]string{"id": client.PartnerID, "partnerId": client.ID, "matchedInterest": client.MatchedInterest})
		if err != nil {
			fmt.Println("Error writing ID:", err)
			return
		}
	}

	for {
		var message map[string]string
		err := ws.ReadJSON(&message)
		if err != nil {
			logForDev("Error reading message:", err)
			disconnectClient(client.ID)

			logForDev("stage 1 ", client.ID, client.PartnerID)

			if len(interests) == 0 {
				removeFromBucket(client.ID)
				removeFromBucket(client.PartnerID)
			} else {
				logForDev("stage 2")
				removeFrominterestBuckets(client.ID, client.Interests)
				logForDev("stage 3")
				// removeFrominterestBuckets(client.PartnerID, clients[client.PartnerID].Interests)
				logForDev("stage 4")
			}
			break
		}

		partnerID := client.PartnerID
		if partnerID != "Null" {
			forwardMessage(partnerID, message)
		}
	}
}

func makeRandomPair(clientID string) {
	logForDev("makeRandomPair for single bucket")
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	if len(bucket) <= 1 {
		return
	}

	// rand.Seed(time.Now().UnixNano())

	var (
		partnerIDIndex int
		partnerID      string
	)
	for {
		partnerIDIndex = rand.Intn(len(bucket))
		partnerID = bucket[partnerIDIndex]
		if partnerID != clientID {
			break
		}
	}

	clients[partnerID].PartnerID = clientID
	clients[clientID].PartnerID = partnerID

	removeFromBucket(partnerID)
	removeFromBucket(clientID)
}

func makeRandomPairForinterests(clientID string, interests []string) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	if len(interests) == 0 {
		return
	}

	var (
		partnerIDIndex int
		partnerID      string
		matchedInterest string
	)

	partnerID = "Null"

	for _, interest := range interests {
		logForDev("interest:", interest)
		if _, ok := interestsBuckets[interest]; !ok {
			continue
		}
		logForDev("interestsBuckets[interest]:", interestsBuckets[interest])
		if len(interestsBuckets[interest]) <= 1 {
			continue
		}
		for {
			partnerIDIndex = rand.Intn(len(interestsBuckets[interest]))
			partnerID = interestsBuckets[interest][partnerIDIndex]
			matchedInterest = interest
			logForDev("partnerID:", partnerID)
			if partnerID != clientID {
				break
			}
		}
	}

	if partnerID == "Null" {
		return
	}

	clients[partnerID].PartnerID = clientID
	clients[clientID].PartnerID = partnerID
	clients[partnerID].MatchedInterest = matchedInterest
	clients[clientID].MatchedInterest = matchedInterest

	removeFrominterestBuckets(clientID, clients[clientID].Interests)
	removeFrominterestBuckets(partnerID, clients[partnerID].Interests)
}

func removeFromBucket(id string) {
	for i, v := range bucket {
		if v == id {
			bucket = append(bucket[:i], bucket[i+1:]...)
			break
		}
	}
}

func removeFrominterestBuckets(id string, interests []string) {
	logForDev("id:", id)
	logForDev("interests:", interests)

	for _, interest := range interests {
		for i, v := range interestsBuckets[interest] {
			if v == id {
				interestsBuckets[interest] = append(interestsBuckets[interest][:i], interestsBuckets[interest][i+1:]...)
				break
			}
		}
	}
}

func forwardMessage(partnerID string, message map[string]string) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	if pair, ok := clients[partnerID]; ok {
		err := pair.Conn.WriteJSON(message)
		if err != nil {
			fmt.Println("Error writing message to client", partnerID, err)
		}
	}
}

func disconnectClient(clientID string) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	if client, ok := clients[clientID]; ok {
		if client.Conn != nil {
			err := client.Conn.Close()
			if err != nil {
				fmt.Println("Error closing WebSocket connection for client", clientID, err)
			}
		}
		delete(clients, clientID)

		if client.PartnerID != "Null" {
			if pair, ok := clients[client.PartnerID]; ok {
				if pair.Conn != nil {
					err := pair.Conn.Close()
					if err != nil {
						fmt.Println("Error closing WebSocket connection for client", client.PartnerID, err)
					}
				}
				delete(clients, client.PartnerID)
			}
		}

		logForDev("Client disconnected:", clientID)
	}
}
